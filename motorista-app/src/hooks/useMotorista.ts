import { useCallback, useEffect, useState } from 'react'
import { supabase, erroMsg } from '@/lib/supabase'

// ---- Types ----
export type SituacaoOp = 'aguardando'|'em_rota'|'concluida'
export type Trecho = 'ida'|'volta'
export interface RotaMot { rota_id:string; codigo:string; nome:string; horario_partida:string; horario_retorno:string; status:string; situacao_operacional:SituacaoOp; motorista_id:string; origem:string|null; destino:string|null; placa:string; modelo:string; capacidade_maxima:number; passageiros:number }
export interface Pax { alocacao_id:string; estudante_id:string; nome:string; prontuario:string; curso:string|null; universidade:string|null; perfil_uso:string; confirmou_ida:boolean; hora_ida:string|null; confirmou_volta:boolean; hora_volta:string|null }
export interface Aviso { id:string; rota_id:string; mensagem:string; criado_em:string }
export interface Msg { id:string; remetente_id:string|null; destinatario_id:string|null; assunto:string; corpo:string; lida_em:string|null; criado_em:string; remetente?:{nome:string}|null }
export interface SolVolta { id:string; alocacao_id:string; rota_id:string; data:string; justificativa:string; status:string; criado_em:string; estudante_nome?:string }

export const ROTULO_SIT: Record<SituacaoOp,string> = { aguardando:'Aguardando', em_rota:'Em rota', concluida:'Concluída' }
export const COR_SIT: Record<SituacaoOp,string> = { aguardando:'bg-amber-500/20 text-amber-400', em_rota:'bg-emerald-500/20 text-emerald-400', concluida:'bg-blue-500/20 text-blue-400' }

/** Data de hoje no fuso local — toISOString() devolveria o dia anterior à noite. */
export function hoje(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

/**
 * motorista.id do usuario logado. Nao e o uuid do Auth: a ligacao e
 * motorista.perfil_id = auth.uid(), a mesma que meu_motorista_id() usa nas
 * policies (0002_rls.sql) e no prefixo do storage.
 */
export async function meuMotoristaId():Promise<string|null> {
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) return null
  const {data}=await supabase.from('motorista').select('id').eq('perfil_id',user.id).maybeSingle()
  return (data as {id:string}|null)?.id ?? null
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
    const {data}=await supabase.from('vw_minhas_rotas_motorista').select('*').eq('motorista_id',motoristaId).order('horario_partida')
    setRotas((data as RotaMot[])||[]); setLoading(false)
  },[motoristaId,lm])
  useEffect(()=>{refresh()},[refresh]); return {rotas,loading,refresh,motoristaId}
}

/**
 * Manifesto do dia: alocacoes ativas da rota + a presenca de cada uma. Nao
 * existe RPC para isso — o painel administrativo monta a lista com estas
 * mesmas duas consultas (src/pages/motorista/Passageiros.tsx).
 */
export function usePassageiros(rotaId:string|null) {
  const [pax,setPax]=useState<Pax[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{
    if(!rotaId){ setPax([]); return }
    setLoading(true)
    const {data:alocacoes}=await supabase.from('alocacao_estudante')
      .select('id, estudante:estudante_id (id, nome, prontuario, curso, perfil_uso, universidade:universidade_id (nome))')
      .eq('rota_id',rotaId).eq('ativa',true).eq('situacao','alocado')
    const lista=((alocacoes as any[])||[]).filter(a=>a.estudante)
    const ids=lista.map(a=>a.id)
    let presencas:any[]=[]
    if(ids.length>0){
      const {data:p}=await supabase.from('presenca').select('*').eq('data',hoje()).in('alocacao_id',ids)
      presencas=(p as any[])||[]
    }
    const porAlocacao=new Map(presencas.map(p=>[p.alocacao_id,p]))
    setPax(lista.map(a=>{
      const pr=porAlocacao.get(a.id)
      return {
        alocacao_id:a.id, estudante_id:a.estudante.id, nome:a.estudante.nome,
        prontuario:a.estudante.prontuario, curso:a.estudante.curso,
        universidade:a.estudante.universidade?.nome??null, perfil_uso:a.estudante.perfil_uso,
        confirmou_ida:!!pr?.confirmou_ida, hora_ida:pr?.hora_ida??null,
        confirmou_volta:!!pr?.confirmou_volta, hora_volta:pr?.hora_volta??null,
      } as Pax
    }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')))
    setLoading(false)
  },[rotaId])
  useEffect(()=>{refresh()},[refresh]); return {pax,loading,refresh}
}

export function useAvisos(rotaId:string|null) {
  const [avisos,setAvisos]=useState<Aviso[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{ if(!rotaId){setAvisos([]);return} setLoading(true); const {data}=await supabase.from('aviso_rota').select('*').eq('rota_id',rotaId).order('criado_em',{ascending:false}).limit(20); setAvisos((data as Aviso[])||[]); setLoading(false)},[rotaId])
  useEffect(()=>{refresh()},[refresh])
  // autor_id nao tem default no banco e a policy aviso_delete depende dele:
  // sem gravar o autor, o motorista nao removeria o proprio aviso.
  const enviar=async(msg:string)=>{
    if(!rotaId)return
    const {data:{user}}=await supabase.auth.getUser()
    const{error}=await supabase.from('aviso_rota').insert({rota_id:rotaId,mensagem:msg,autor_id:user?.id??null})
    if(error)throw new Error(erroMsg(error)); await refresh()
  }
  const excluir=async(id:string)=>{ const{error}=await supabase.from('aviso_rota').delete().eq('id',id); if(error)throw new Error(erroMsg(error)); await refresh() }
  return {avisos,loading,enviar,excluir}
}

export function useMensagens() {
  const [msgs,setMsgs]=useState<Msg[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{ setLoading(true); const {data:{user}}=await supabase.auth.getUser(); if(!user){setLoading(false);return}; const {data}=await supabase.from('mensagem').select('id,remetente_id,destinatario_id,assunto,corpo,lida_em,criado_em,remetente:remetente_id(nome)').or(`remetente_id.eq.${user.id},destinatario_id.eq.${user.id}`).order('criado_em',{ascending:false}).limit(50); setMsgs((data as unknown as Msg[])||[]); setLoading(false)},[])
  useEffect(()=>{refresh()},[refresh])
  // A policy mensagem_insert exige remetente_id = auth.uid(); sem o campo o
  // insert e recusado pela RLS. Sem destinatario, a mensagem fica com o staff.
  const enviar=async(assunto:string,corpo:string)=>{
    const {data:{user}}=await supabase.auth.getUser()
    if(!user) throw new Error('Não autenticado')
    const{error}=await supabase.from('mensagem').insert({assunto,corpo,remetente_id:user.id})
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

export async function atualizarSituacao(rotaId:string, sit:SituacaoOp) { const{error}=await supabase.rpc('atualizar_situacao_rota',{p_rota_id:rotaId,p_situacao:sit}); if(error)throw new Error(erroMsg(error)) }
export async function registrarGPS(rotaId:string, lat:number, lng:number) { try { await supabase.from('localizacao_rota').insert({rota_id:rotaId,latitude:lat,longitude:lng}) } catch {} }

// ---- Check-in / Check-out ----
export async function confirmarPresenca(estudanteId:string, trecho:Trecho, data:string) {
  const {data:r, error} = await supabase.rpc('confirmar_presenca', { p_estudante_id: estudanteId, p_trecho: trecho, p_data: data })
  if(error) throw new Error(erroMsg(error))
  return r as { mensagem:string }
}

export async function cancelarPresenca(estudanteId:string, trecho:Trecho, motivo:string, data:string) {
  const {data:r, error} = await supabase.rpc('cancelar_presenca', { p_estudante_id: estudanteId, p_trecho: trecho, p_motivo: motivo, p_data: data })
  if(error) throw new Error(erroMsg(error))
  return r as { mensagem:string }
}

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
export interface HistViagem { data:string; rota_codigo:string; rota_nome:string; total_ida:number; total_volta:number }

/**
 * presenca nao tem coluna "trecho": o dia de um aluno cabe em uma linha so,
 * com os booleanos confirmou_ida e confirmou_volta (0001_schema.sql). A
 * policy presenca_motorista ja limita as linhas as rotas do motorista.
 */
export function useHistorico() {
  const [hist,setHist]=useState<HistViagem[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    setLoading(true)
    const desde=new Date(); desde.setDate(desde.getDate()-30)
    const {data}=await supabase.from('presenca')
      .select('data,confirmou_ida,confirmou_volta,alocacao:alocacao_id(rota:rota_id(codigo,nome))')
      .gte('data',desde.toISOString().slice(0,10)).order('data',{ascending:false}).limit(500)
    const map=new Map<string,HistViagem>()
    for(const p of ((data as any[])||[])) {
      const r=p.alocacao?.rota
      const chave=`${p.data}|${r?.codigo??''}`
      const cur=map.get(chave)||{data:p.data,rota_codigo:r?.codigo||'',rota_nome:r?.nome||'',total_ida:0,total_volta:0}
      if(p.confirmou_ida) cur.total_ida++
      if(p.confirmou_volta) cur.total_volta++
      map.set(chave,cur)
    }
    setHist([...map.values()].filter(h=>h.total_ida>0||h.total_volta>0).sort((a,b)=>b.data.localeCompare(a.data)))
    setLoading(false)
  },[])
  useEffect(()=>{refresh()},[refresh])
  return {hist,loading,refresh}
}
