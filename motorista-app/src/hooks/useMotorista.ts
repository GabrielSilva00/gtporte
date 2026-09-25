import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase, erroMsg, ehFalhaDeRede, meuUsuarioId } from '@/lib/supabase'
import { gravarCache, lerCache } from '@/lib/cacheLocal'
import { enfileirar, inscreverFila, itensDaFila, sincronizar, type Operacao, type Resultado } from '@/lib/filaOffline'

// ---- Types ----
export type SituacaoOp = 'aguardando'|'em_rota'|'concluida'
export type Trecho = 'ida'|'volta'
export interface RotaMot { rota_id:string; codigo:string; nome:string; horario_partida:string; horario_retorno:string; status:string; situacao_operacional:SituacaoOp; motorista_id:string; origem:string|null; destino:string|null; placa:string; modelo:string; capacidade_maxima:number; passageiros:number }
export interface Pax {
  alocacao_id:string; estudante_id:string; nome:string; prontuario:string; curso:string|null; universidade:string|null; perfil_uso:string
  confirmou_ida:boolean; hora_ida:string|null; confirmou_volta:boolean; hora_volta:string|null
  /** O motorista registrou o embarque (0028). */
  embarcou_ida:boolean; embarcou_volta:boolean
  /** O aluno confirmou pelo app que vai (0028). */
  checkin_aluno_ida:boolean; checkin_aluno_volta:boolean
  cancelou_ida:boolean; cancelou_volta:boolean
  /** Registro feito sem internet, ainda na fila para o banco. */
  pendente_ida:boolean; pendente_volta:boolean
}
export interface Msg { id:string; remetente_id:string|null; destinatario_id:string|null; assunto:string; corpo:string; lida_em:string|null; criado_em:string; remetente?:{nome:string}|null }
export interface SolVolta { id:string; alocacao_id:string; rota_id:string; data:string; justificativa:string; status:string; criado_em:string; estudante_nome?:string }

export const ROTULO_SIT: Record<SituacaoOp,string> = { aguardando:'Aguardando', em_rota:'Em rota', concluida:'Concluída' }
export const COR_SIT: Record<SituacaoOp,string> = { aguardando:'bg-amber-500/20 text-amber-400', em_rota:'bg-emerald-500/20 text-emerald-400', concluida:'bg-blue-500/20 text-blue-400' }

/** Data de hoje no fuso local — toISOString() devolveria o dia anterior à noite. */
export function hoje(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

/**
 * motorista.id do usuario logado. Nao e o uuid do Auth: a ligacao e
 * motorista.perfil_id = auth.uid(), a mesma que meu_motorista_id() usa nas
 * policies (0002_rls.sql) e no prefixo do storage. Sem rede, vale o
 * ultimo id lido neste aparelho para este usuario.
 */
export async function meuMotoristaId():Promise<string|null> {
  const uid=await meuUsuarioId()
  if(!uid) return null
  const {data,error}=await supabase.from('motorista').select('id').eq('perfil_id',uid).maybeSingle()
  if(error) return lerCache<string>(`motorista:${uid}`)
  const id=(data as {id:string}|null)?.id ?? null
  if(id) gravarCache(`motorista:${uid}`,id)
  return id
}

export function useMotoristaId() {
  const [id,setId]=useState<string|null>(null); const [loading,setLoading]=useState(true)
  useEffect(()=>{ let vivo=true; meuMotoristaId().then(v=>{ if(vivo){setId(v);setLoading(false)} }); return ()=>{vivo=false} },[])
  return {motoristaId:id,loading}
}

// ---- Hooks ----
/**
 * RN08: o motorista so enxerga as rotas sob responsabilidade dele. A policy
 * rota_select libera a leitura para qualquer autenticado, entao e o filtro
 * explicito por motorista_id que garante o recorte — o painel administrativo
 * faz o mesmo em src/hooks/useMinhasRotas.ts.
 */
export function useRotas() {
  const {motoristaId,loading:lm}=useMotoristaId()
  const [rotas,setRotas] = useState<RotaMot[]>([]); const [loading,setLoading] = useState(true)
  const refresh = useCallback(async()=>{
    if(!motoristaId){ setRotas([]); setLoading(lm); return }
    setLoading(true)
    const {data,error}=await supabase.from('vw_minhas_rotas_motorista').select('*').eq('motorista_id',motoristaId).order('horario_partida')
    if(error){ setRotas(lerCache<RotaMot[]>(`rotas:${motoristaId}`)??[]); setLoading(false); return }
    gravarCache(`rotas:${motoristaId}`,data)
    setRotas((data as RotaMot[])||[]); setLoading(false)
  },[motoristaId,lm])
  useEffect(()=>{refresh()},[refresh]); return {rotas,loading,refresh,motoristaId}
}

/** Dia da semana como o banco grava em alocacao_estudante.dia_semana (0 = domingo). */
export function diaDaSemana(data:string){ const [y,m,d]=data.split('-').map(Number); return new Date(y,m-1,d).getDay() }

type PaxServidor=Omit<Pax,'pendente_ida'|'pendente_volta'>

/**
 * Manifesto do dia: alocacoes ativas da rota que valem para hoje (a do dia
 * da semana ou a generica, 0022) + a presenca de cada uma. Sem rede, usa a
 * ultima lista lida neste aparelho, e o que estiver na fila offline ja
 * aparece aplicado.
 */
export function usePassageiros(rotaId:string|null) {
  const [base,setBase]=useState<PaxServidor[]>([]); const [loading,setLoading]=useState(false)
  const [offline,setOffline]=useState(false)
  const fila=useSyncExternalStore(inscreverFila,itensDaFila,itensDaFila)
  const refresh=useCallback(async()=>{
    if(!rotaId){ setBase([]); return }
    const dia=hoje(); const chave=`pax:${rotaId}:${dia}`
    setLoading(true)
    const {data:alocacoes,error}=await supabase.from('alocacao_estudante')
      .select('id, estudante:estudante_id (id, nome, prontuario, curso, perfil_uso, universidade:universidade_id (nome))')
      .eq('rota_id',rotaId).eq('ativa',true).eq('situacao','alocado')
      .or(`dia_semana.is.null,dia_semana.eq.${diaDaSemana(dia)}`)
    const lista=((alocacoes as any[])||[]).filter(a=>a.estudante)
    const ids=lista.map(a=>a.id)
    let presencas:any[]=[]; let falhou=!!error
    if(!error&&ids.length>0){
      const {data:p,error:e2}=await supabase.from('presenca').select('*').eq('data',dia).in('alocacao_id',ids)
      presencas=(p as any[])||[]; falhou=!!e2
    }
    if(falhou){
      setBase(lerCache<PaxServidor[]>(chave)??[]); setOffline(true); setLoading(false); return
    }
    const porAlocacao=new Map(presencas.map(p=>[p.alocacao_id,p]))
    const novos=lista.map(a=>{
      const pr=porAlocacao.get(a.id)
      // Antes de 0028 nao havia embarque separado: vale a confirmacao.
      const temEmbarque=!!pr&&'embarque_ida_em' in pr
      return {
        alocacao_id:a.id, estudante_id:a.estudante.id, nome:a.estudante.nome,
        prontuario:a.estudante.prontuario, curso:a.estudante.curso,
        universidade:a.estudante.universidade?.nome??null, perfil_uso:a.estudante.perfil_uso,
        confirmou_ida:!!pr?.confirmou_ida, hora_ida:pr?.hora_ida??null,
        confirmou_volta:!!pr?.confirmou_volta, hora_volta:pr?.hora_volta??null,
        embarcou_ida:temEmbarque?!!pr.embarque_ida_em:!!pr?.confirmou_ida,
        embarcou_volta:temEmbarque?!!pr.embarque_volta_em:!!pr?.confirmou_volta,
        checkin_aluno_ida:!!pr?.checkin_aluno_ida_em, checkin_aluno_volta:!!pr?.checkin_aluno_volta_em,
        cancelou_ida:!!pr?.cancelou_ida, cancelou_volta:!!pr?.cancelou_volta,
      } as PaxServidor
    }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    gravarCache(chave,novos)
    setBase(novos); setOffline(false); setLoading(false)
  },[rotaId])
  useEffect(()=>{refresh()},[refresh])
  // Quando a fila esvazia (voltou a rede), rele para mostrar o que o banco gravou.
  const [tinhaFila,setTinhaFila]=useState(fila.length>0)
  useEffect(()=>{
    if(fila.length>0){ setTinhaFila(true); return }
    if(tinhaFila){ setTinhaFila(false); refresh() }
  },[fila.length,tinhaFila,refresh])

  const pax=useMemo(()=>aplicarFila(base,fila.map(i=>i.op)),[base,fila])
  return {pax,loading,refresh,offline}
}

/** Mostra na lista o efeito das operacoes que ainda nao chegaram ao banco. */
export function aplicarFila(base:PaxServidor[],ops:Operacao[]):Pax[]{
  const hojeStr=hoje()
  return base.map(p=>{
    const r:Pax={...p,pendente_ida:false,pendente_volta:false}
    for(const op of ops){
      if(op.tipo==='situacao'||op.estudanteId!==p.estudante_id||op.data!==hojeStr) continue
      const t=op.trecho
      if(op.tipo==='confirmar'){
        r[`embarcou_${t}`]=true; r[`confirmou_${t}`]=true; r[`cancelou_${t}`]=false
      }else{
        r[`embarcou_${t}`]=false; r[`confirmou_${t}`]=r[`checkin_aluno_${t}`]
      }
      r[`pendente_${t}`]=true
    }
    return r
  })
}

export function useMensagens() {
  const [msgs,setMsgs]=useState<Msg[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{ setLoading(true); const uid=await meuUsuarioId(); if(!uid){setLoading(false);return}; const {data}=await supabase.from('mensagem').select('id,remetente_id,destinatario_id,assunto,corpo,lida_em,criado_em,remetente:remetente_id(nome)').or(`remetente_id.eq.${uid},destinatario_id.eq.${uid}`).order('criado_em',{ascending:false}).limit(50); setMsgs((data as unknown as Msg[])||[]); setLoading(false)},[])
  useEffect(()=>{refresh()},[refresh])
  // A policy mensagem_insert exige remetente_id = auth.uid(); sem o campo o
  // insert e recusado pela RLS. Sem destinatario, a mensagem fica com o staff.
  const enviar=async(assunto:string,corpo:string)=>{
    const uid=await meuUsuarioId()
    if(!uid) throw new Error('Não autenticado')
    const{error}=await supabase.from('mensagem').insert({assunto,corpo,remetente_id:uid})
    if(error)throw new Error(erroMsg(error)); await refresh()
  }
  const marcarLida=async(id:string)=>{ await supabase.from('mensagem').update({lida_em:new Date().toISOString()}).eq('id',id); await refresh() }
  return {msgs,loading,enviar,marcarLida,refresh}
}

export function useSolicitacoesVolta(rotaId:string|null) {
  const [sol,setSol]=useState<SolVolta[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{ if(!rotaId){setSol([]);return} setLoading(true); const {data}=await supabase.from('solicitacao_volta').select('*').eq('rota_id',rotaId).eq('data',hoje()).order('criado_em',{ascending:false}); setSol((data as SolVolta[])||[]); setLoading(false)},[rotaId])
  useEffect(()=>{refresh()},[refresh])
  // A funcao no banco e uma so, com o booleano p_aprovar (0012_solicitacao_volta.sql).
  const decidir=async(id:string,aprov:boolean,motivo?:string)=>{ const{error}=await supabase.rpc('decidir_solicitacao_volta',{p_solicitacao_id:id,p_aprovar:aprov,p_motivo:motivo??null}); if(error)throw new Error(erroMsg(error)); await refresh() }
  return {sol,loading,decidir,refresh}
}

/**
 * Grava a posicao do onibus. No banco, cada posicao passa pelo gatilho
 * geofence_universidade (0027), que avisa os alunos quando o onibus entra
 * ou sai do raio de uma universidade. Sem rede a posicao e descartada (ver
 * lib/filaOffline.ts).
 */
export async function registrarGPS(rotaId:string, lat:number, lng:number) {
  const {error}=await supabase.from('localizacao_rota').insert({rota_id:rotaId,latitude:lat,longitude:lng})
  return !error
}

// ---- Operacoes que funcionam sem internet ----

/** Funcao ausente no banco: a migration 0028 ainda nao foi aplicada. */
function funcaoAusente(e:{code?:string}|null){ return e?.code==='PGRST202'||e?.code==='42883' }

/** Executa uma operacao no banco, dizendo se falhou por rede (fica na fila) ou foi recusada. */
export async function executarOperacao(op:Operacao):Promise<Resultado> {
  let error:{message?:string;code?:string}|null=null
  if(op.tipo==='situacao'){
    ({error}=await supabase.rpc('atualizar_situacao_rota',{p_rota_id:op.rotaId,p_situacao:op.situacao}))
  }else if(op.tipo==='confirmar'){
    ({error}=await supabase.rpc('confirmar_presenca',{p_estudante_id:op.estudanteId,p_trecho:op.trecho,p_data:op.data}))
  }else{
    ({error}=await supabase.rpc('desfazer_embarque',{p_estudante_id:op.estudanteId,p_trecho:op.trecho,p_data:op.data}))
    if(funcaoAusente(error)){
      // Banco sem 0028: o unico jeito de desfazer era cancelar a presenca.
      ({error}=await supabase.rpc('cancelar_presenca',{p_estudante_id:op.estudanteId,p_trecho:op.trecho,p_motivo:'Embarque desfeito pelo motorista',p_data:op.data}))
    }
  }
  if(!error) return {ok:true}
  if(ehFalhaDeRede(error)) return {ok:false,motivo:'rede'}
  return {ok:false,motivo:'recusada',mensagem:erroMsg(error)}
}

/**
 * Tenta gravar agora; sem rede, guarda na fila e devolve 'pendente'.
 * Recusa do banco (regra de negocio) vira excecao, como antes.
 */
export async function registrar(op:Operacao):Promise<'gravado'|'pendente'> {
  // Com fila parada, a operacao nova vai para o fim dela: a ordem importa
  // (confirmar e depois desfazer o mesmo aluno).
  if(!navigator.onLine||itensDaFila().length>0){ enfileirar(op); void sincronizarFila(); return 'pendente' }
  const r=await executarOperacao(op)
  if(r.ok) return 'gravado'
  if(r.motivo==='rede'){ enfileirar(op); return 'pendente' }
  throw new Error(r.mensagem)
}

let avisarRecusa:(op:Operacao,msg:string)=>void=()=>{}
/** Quem mostra ao motorista que um registro feito offline foi recusado (App). */
export function aoRecusarOperacao(f:(op:Operacao,msg:string)=>void){ avisarRecusa=f }

export function sincronizarFila(){ return sincronizar(executarOperacao,(op,msg)=>avisarRecusa(op,msg)) }

export function atualizarSituacao(rotaId:string, sit:SituacaoOp) { return registrar({tipo:'situacao',rotaId,situacao:sit}) }

// ---- Documentos do motorista ----
export type TipoDocMot = 'cnh_frente'|'cnh_verso'|'residencia'|'toxicologico'|'aso'|'certificado'|'contrato'|'outro'
export interface DocMot { id:string; tipo:TipoDocMot; nome_arquivo:string; storage_path:string; validade:string|null; status:'pendente'|'aprovado'|'rejeitado'; observacao:string|null; criado_em:string }

export const ROTULO_DOC: Record<TipoDocMot,string> = {
  cnh_frente:'CNH (frente)', cnh_verso:'CNH (verso)', residencia:'Comprovante de residência',
  toxicologico:'Exame toxicológico', aso:'ASO', certificado:'Certificado de curso', contrato:'Contrato', outro:'Outro'
}

export function useDocumentos() {
  const [docs,setDocs]=useState<DocMot[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    setLoading(true)
    const motoristaId=await meuMotoristaId()
    if(!motoristaId){setLoading(false);return}
    const {data}=await supabase.from('documento_motorista').select('id,tipo,nome_arquivo,storage_path,validade,status,observacao,criado_em').eq('motorista_id',motoristaId).order('criado_em',{ascending:false})
    setDocs((data as DocMot[])||[]); setLoading(false)
  },[])
  useEffect(()=>{refresh()},[refresh])

  const upload=async(tipo:TipoDocMot, arquivo:File, validade?:string)=>{
    const motoristaId=await meuMotoristaId()
    if(!motoristaId) throw new Error('Este acesso não está vinculado a um motorista.')
    const ext=arquivo.name.split('.').pop()?.toLowerCase()||'bin'
    const path=`motorista/${motoristaId}/${tipo}-${Date.now()}.${ext}`
    const {error:upErr}=await supabase.storage.from('documentos').upload(path,arquivo)
    if(upErr) throw new Error(erroMsg(upErr))
    const {error}=await supabase.from('documento_motorista').insert({ motorista_id:motoristaId, tipo, nome_arquivo:arquivo.name, storage_path:path, validade:validade||null, status:'pendente' })
    if(error) throw new Error(erroMsg(error))
    await refresh()
  }

  return {docs,loading,refresh,upload}
}

// ---- Histórico de viagens ----
export interface HistViagem { data:string; rota_id:string; rota_codigo:string; rota_nome:string; total_ida:number; total_volta:number; cancelamentos:number }

/**
 * presenca nao tem coluna "trecho": o dia de um aluno cabe em uma linha so,
 * com os booleanos confirmou_ida e confirmou_volta (0001_schema.sql). A
 * policy presenca_motorista ja limita as linhas as rotas do motorista.
 */
export function useHistorico() {
  const [hist,setHist]=useState<HistViagem[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    setLoading(true)
    const d=new Date(); d.setDate(d.getDate()-30)
    const desde=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const {data}=await supabase.from('presenca')
      .select('*,alocacao:alocacao_id(rota:rota_id(id,codigo,nome))')
      .gte('data',desde).order('data',{ascending:false}).limit(2000)
    const map=new Map<string,HistViagem>()
    for(const p of ((data as any[])||[])) {
      const r=p.alocacao?.rota
      if(!r) continue
      const chave=`${p.data}|${r.id}`
      const cur=map.get(chave)||{data:p.data,rota_id:r.id,rota_codigo:r.codigo||'',rota_nome:r.nome||'',total_ida:0,total_volta:0,cancelamentos:0}
      // Mesma regra do detalhe (resumirTrecho): so conta quem embarcou.
      const foi=(t:Trecho)=>!!p[`embarque_${t}_em`]||(p[`confirmou_${t}`]&&!p[`checkin_aluno_${t}_em`])
      if(foi('ida')) cur.total_ida++
      if(foi('volta')) cur.total_volta++
      if(p.cancelou_ida||p.cancelou_volta) cur.cancelamentos++
      map.set(chave,cur)
    }
    setHist([...map.values()].filter(h=>h.total_ida>0||h.total_volta>0||h.cancelamentos>0)
      .sort((a,b)=>b.data.localeCompare(a.data)||a.rota_codigo.localeCompare(b.rota_codigo)))
    setLoading(false)
  },[])
  useEffect(()=>{refresh()},[refresh])
  return {hist,loading,refresh}
}

export interface LinhaViagem {
  estudante_id:string; nome:string; prontuario:string; perfil_uso:string
  confirmou_ida:boolean; confirmou_volta:boolean
  checkin_aluno_ida_em:string|null; checkin_aluno_volta_em:string|null
  embarque_ida_em:string|null; embarque_volta_em:string|null
  hora_ida:string|null; hora_volta:string|null
  cancelou_ida:boolean; cancelou_volta:boolean
  motivo_cancelamento_ida:string|null; motivo_cancelamento_volta:string|null
}

export interface ResumoTrecho {
  /** Embarcaram (registro do motorista; sem ele, a confirmacao registrada pela secretaria). */
  foram:LinhaViagem[]
  /** Confirmaram pelo app e nao tiveram o embarque registrado. */
  semEmbarque:LinhaViagem[]
  cancelaram:LinhaViagem[]
  /** O motorista registrou algum embarque neste trecho: so entao "sem embarque" quer dizer que nao foi. */
  conferido:boolean
}

/** Separa as linhas do dia em quem foi, quem confirmou e nao foi, e quem cancelou. Pura, para testes. */
export function resumirTrecho(linhas:LinhaViagem[], t:Trecho):ResumoTrecho {
  const emb=(l:LinhaViagem)=>t==='ida'?l.embarque_ida_em:l.embarque_volta_em
  const chk=(l:LinhaViagem)=>t==='ida'?l.checkin_aluno_ida_em:l.checkin_aluno_volta_em
  const conf=(l:LinhaViagem)=>t==='ida'?l.confirmou_ida:l.confirmou_volta
  const canc=(l:LinhaViagem)=>t==='ida'?l.cancelou_ida:l.cancelou_volta
  const conferido=linhas.some(l=>!!emb(l))
  return {
    // Confirmacao sem marca de aluno nem de embarque: registro antigo (antes de
    // 0028) ou feito pela secretaria. Conta como presenca.
    foram:linhas.filter(l=>!!emb(l)||(conf(l)&&!chk(l))),
    semEmbarque:linhas.filter(l=>conf(l)&&!!chk(l)&&!emb(l)),
    cancelaram:linhas.filter(canc),
    conferido,
  }
}

/** Quem foi, voltou, cancelou... numa viagem do historico (0028). */
export function useDetalheViagem(rotaId:string|null, data:string|null) {
  const [linhas,setLinhas]=useState<LinhaViagem[]>([]); const [loading,setLoading]=useState(false)
  const [erro,setErro]=useState<string|null>(null)
  useEffect(()=>{
    if(!rotaId||!data){ setLinhas([]); return }
    let vivo=true
    setLoading(true); setErro(null)
    supabase.rpc('detalhe_viagem_motorista',{p_rota_id:rotaId,p_data:data}).then(({data:r,error})=>{
      if(!vivo) return
      if(error) setErro(funcaoAusente(error)?'O detalhe da viagem precisa da atualização 0028 do banco.':erroMsg(error))
      setLinhas((r as LinhaViagem[])||[]); setLoading(false)
    })
    return ()=>{vivo=false}
  },[rotaId,data])
  return {linhas,loading,erro}
}

// ---- Alunos das rotas por dia da semana ----
export interface AlunoDoDia { alocacao_id:string; rota_id:string; estudante_id:string; nome:string; prontuario:string; curso:string|null; universidade:string|null; perfil_uso:string; fixo:boolean }

/**
 * Alunos vinculados a cada rota do motorista num dia da semana: a alocacao
 * daquele dia ou a que vale para todos os dias (0022). Consulta simples
 * (GET), que o service worker guarda para uso sem internet.
 */
export function useAlunosPorDia(rotaIds:string[], dia:number) {
  const [alunos,setAlunos]=useState<AlunoDoDia[]>([]); const [loading,setLoading]=useState(false)
  const chaveRotas=rotaIds.join(',')
  const refresh=useCallback(async()=>{
    if(!chaveRotas){ setAlunos([]); return }
    const chave=`alunos-dia:${chaveRotas}:${dia}`
    setLoading(true)
    const {data,error}=await supabase.from('alocacao_estudante')
      .select('id, rota_id, dia_semana, estudante:estudante_id (id, nome, prontuario, curso, perfil_uso, universidade:universidade_id (nome))')
      .in('rota_id',chaveRotas.split(',')).eq('ativa',true).eq('situacao','alocado')
      .or(`dia_semana.is.null,dia_semana.eq.${dia}`)
    if(error){ setAlunos(lerCache<AlunoDoDia[]>(chave)??[]); setLoading(false); return }
    const lista=((data as any[])||[]).filter(a=>a.estudante).map(a=>({
      alocacao_id:a.id, rota_id:a.rota_id, estudante_id:a.estudante.id, nome:a.estudante.nome,
      prontuario:a.estudante.prontuario, curso:a.estudante.curso, universidade:a.estudante.universidade?.nome??null,
      perfil_uso:a.estudante.perfil_uso, fixo:a.dia_semana==null,
    } as AlunoDoDia)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    gravarCache(chave,lista)
    setAlunos(lista); setLoading(false)
  },[chaveRotas,dia])
  useEffect(()=>{refresh()},[refresh])
  return {alunos,loading,refresh}
}

export interface TrocaPendente {
  id: string
  estudante_id: string
  estudante: string
  prontuario: string
  rota_origem: string | null
  justificativa: string | null
  criado_em: string
}

/**
 * Trocas de onibus aguardando decisao (0023_paradas_e_troca_de_rota).
 * O estudante cancelou a volta na rota dele e pediu para voltar nesta;
 * quem responde pela lotacao do veiculo e o motorista, entao e ele quem
 * aceita ou recusa.
 */
export function useTrocasRota() {
  const [trocas,setTrocas]=useState<TrocaPendente[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{
    setLoading(true)
    const {data}=await supabase.rpc('trocas_pendentes_motorista')
    setTrocas((data as TrocaPendente[])||[]); setLoading(false)
  },[])
  useEffect(()=>{refresh()},[refresh])
  const decidir=async(id:string,aprovar:boolean,motivo?:string)=>{
    const{error}=await supabase.rpc('decidir_troca_rota',{p_id:id,p_aprovar:aprovar,p_motivo_recusa:motivo??null})
    if(error)throw new Error(erroMsg(error)); await refresh()
  }
  return {trocas,loading,decidir,refresh}
}

// ---- Conversas (0027) ----
export interface ConversaMot {
  id: string
  tipo: 'direta' | 'grupo'
  situacao: 'bot' | 'humano' | 'encerrada'
  titulo: string
  assunto: string | null
  rota_id: string
  rota: string
  ultima_em: string
  ultima_msg: string | null
  /** A ultima fala e de outra pessoa: esperando resposta do motorista. */
  aguardando: boolean
  /** Mensagens de outras pessoas depois da ultima leitura (0028). */
  nao_lidas?: number
}

export interface MsgConversa {
  id: string
  autor_id: string | null
  autor_nome: string | null
  autor_tipo: string | null
  eh_bot: boolean
  corpo: string
  criado_em: string
}

/**
 * Conversas dos estudantes com o motorista e os grupos das rotas dele.
 * Mensagem nova em qualquer uma chega pelo Realtime e recarrega a lista.
 * Um so uso no App: a lista alimenta a aba e o contador do menu.
 */
export function useConversasMotorista() {
  const [conversas,setConversas]=useState<ConversaMot[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    await supabase.rpc('garantir_grupos_das_rotas')
    const {data,error}=await supabase.rpc('conversas_do_motorista')
    if(!error) setConversas((data as ConversaMot[])||[])
    setLoading(false)
  },[])
  useEffect(()=>{
    refresh()
    const canal=supabase.channel('motorista-conversas')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'conversa_mensagem'},()=>refresh())
      .subscribe()
    return ()=>{ supabase.removeChannel(canal) }
  },[refresh])
  /** Zera o contador da conversa na tela antes da resposta do banco. */
  const marcarLidaLocal=useCallback((id:string)=>{
    setConversas(l=>l.map(c=>c.id===id?{...c,nao_lidas:0}:c))
  },[])
  return {conversas,loading,refresh,marcarLidaLocal}
}

export type ConversasMotorista=ReturnType<typeof useConversasMotorista>

/**
 * Mensagens ainda nao lidas: as das conversas (0028) mais os recados da
 * secretaria sem lida_em. Sem 0028 no banco, conta as conversas diretas
 * esperando resposta.
 */
export function useRecadosNaoLidos(){
  const [n,setN]=useState(0)
  const refresh=useCallback(async()=>{
    const uid=await meuUsuarioId(); if(!uid) return
    const {count}=await supabase.from('mensagem').select('id',{count:'exact',head:true}).eq('destinatario_id',uid).is('lida_em',null)
    setN(count??0)
  },[])
  useEffect(()=>{ refresh(); const t=setInterval(refresh,60000); return ()=>clearInterval(t) },[refresh])
  return {naoLidos:n,refresh}
}

export function contarNaoLidas(conversas:ConversaMot[]){
  return conversas.reduce((t,c)=>t+(c.nao_lidas ?? (c.tipo==='direta'&&c.aguardando&&c.situacao!=='encerrada'?1:0)),0)
}

export function useMensagensConversa(conversaId:string|null) {
  const [msgs,setMsgs]=useState<MsgConversa[]>([]); const [loading,setLoading]=useState(true)
  const [meuId,setMeuId]=useState<string|null>(null)
  const refresh=useCallback(async()=>{
    if(!conversaId){setMsgs([]);setLoading(false);return}
    setMeuId(await meuUsuarioId())
    const {data,error}=await supabase.rpc('mensagens_da_conversa',{p_conversa_id:conversaId})
    if(!error) setMsgs((data as MsgConversa[])||[])
    // Aberta na tela = lida. Sem 0028 a funcao nao existe e o erro e ignorado.
    await supabase.rpc('marcar_conversa_lida',{p_conversa_id:conversaId})
    setLoading(false)
  },[conversaId])
  useEffect(()=>{
    refresh()
    if(!conversaId) return
    const canal=supabase.channel(`mot-conversa:${conversaId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'conversa_mensagem',filter:`conversa_id=eq.${conversaId}`},()=>refresh())
      .subscribe()
    return ()=>{ supabase.removeChannel(canal) }
  },[conversaId,refresh])
  const enviar=async(corpo:string)=>{
    if(!conversaId||!corpo.trim())return
    const {error}=await supabase.rpc('enviar_mensagem_conversa',{p_conversa_id:conversaId,p_corpo:corpo.trim()})
    if(error)throw new Error(erroMsg(error)); await refresh()
  }
  const encerrar=async()=>{
    if(!conversaId)return
    const {error}=await supabase.rpc('encerrar_conversa',{p_conversa_id:conversaId})
    if(error)throw new Error(erroMsg(error))
  }
  return {msgs,loading,meuId,enviar,encerrar}
}

// ---- Mapa do motorista (0027) ----
export interface ParadaMapa { id:string; ordem:number; nome:string; endereco:string|null; latitude:number|null; longitude:number|null; universidade:string|null; minutos_partida:number|null }
export interface UniversidadeMapa { id:string; nome:string; latitude:number|null; longitude:number|null; raio_m:number; ordem:number; entrou_em:string|null; alunos:number }
export interface DadosMapa { paradas:ParadaMapa[]; universidades:UniversidadeMapa[]; veiculo:{latitude:number;longitude:number;registrado_em:string}|null; situacao:SituacaoOp|null }

/** Paradas, universidades com o raio de aviso e a ultima posicao enviada. */
export function useMapaMotorista(rotaId:string|null) {
  const [dados,setDados]=useState<DadosMapa|null>(null); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{
    if(!rotaId){setDados(null);return}
    setLoading(true)
    const {data}=await supabase.rpc('mapa_motorista',{p_rota_id:rotaId})
    setDados((data as DadosMapa)??null); setLoading(false)
  },[rotaId])
  useEffect(()=>{ refresh(); const t=setInterval(refresh,30000); return ()=>clearInterval(t) },[refresh])
  return {dados,loading,refresh}
}

/** Paradas da rota, lidas uma vez (o mapa da Viagem e que se atualiza sozinho). */
export function useParadas(rotaId:string|null) {
  const [paradas,setParadas]=useState<ParadaMapa[]>([]); const [loading,setLoading]=useState(false)
  useEffect(()=>{
    if(!rotaId){ setParadas([]); return }
    let vivo=true
    setLoading(true)
    supabase.rpc('mapa_motorista',{p_rota_id:rotaId}).then(({data})=>{
      if(!vivo) return
      setParadas(((data as DadosMapa|null)?.paradas??[]).slice().sort((a,b)=>a.ordem-b.ordem)); setLoading(false)
    })
    return ()=>{vivo=false}
  },[rotaId])
  return {paradas,loading}
}
