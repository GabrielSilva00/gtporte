import { useEffect, useRef, useState } from 'react'
import { Bus, ChevronDown, Clock, Map as IconeMapa, MapPin, Navigation, ScanLine, Users, Wand2 } from 'lucide-react'
import { useRotas, usePassageiros, useSolicitacoesVolta, useTrocasRota, useMapaMotorista, atualizarSituacao, registrarGPS, ROTULO_SIT, COR_SIT } from '@/hooks/useMotorista'
import type { SituacaoOp } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'
import { MapaMotorista } from '@/components/MapaMotorista'
import { avaliarLeitura, situacaoSugerida, ESTADO_INICIAL, type EstadoMovimento } from '@/lib/movimento'

const CHAVE_AUTO='gtporte-motorista:situacao-automatica'
function lerAuto(){ try{ return localStorage.getItem(CHAVE_AUTO)!=='0' }catch{ return true } }
// Depois de uma troca automatica, espera antes de trocar de novo: evita
// ficar alternando num transito anda-e-para.
const INTERVALO_AUTO_MS=2*60000

const SITS:SituacaoOp[]=['aguardando','em_rota','concluida']
// Intervalo minimo entre duas posicoes gravadas e tempo maximo de rastreio.
const INTERVALO_GPS_MS=15000
const LIMITE_RASTREIO_MS=4*3600000

/**
 * Painel da viagem do dia. O registro de presenca aluno a aluno mora na aba
 * Check-in — aqui ficam o estado da rota, o rastreamento e os pedidos de
 * volta, que sao decisoes sobre a viagem inteira.
 */
export function Viagem({onIrParaCheckIn}:{onIrParaCheckIn:()=>void}){
  const {rotas,loading:lr,refresh:rr}=useRotas()
  const [sel,setSel]=useState<string|null>(null)
  const rota=rotas.find(r=>r.rota_id===sel)||rotas[0]||null
  const rid=rota?.rota_id||null
  const {pax}=usePassageiros(rid)
  const {sol,decidir}=useSolicitacoesVolta(rid)
  const {trocas,decidir:decidirTroca}=useTrocasRota()
  const [decidindoTroca,setDecidindoTroca]=useState<string|null>(null)
  const [track,setTrack]=useState(false)
  const [busy,setBusy]=useState(false)
  const [decidindo,setDecidindo]=useState<string|null>(null)
  const [posicao,setPosicao]=useState<{lat:number;lng:number}|null>(null)
  const {dados:mapa,loading:carregandoMapa,refresh:atualizarMapa}=useMapaMotorista(rid)
  const timers=useRef<{watch?:number;to?:number;ultimo:number;avisoSinal:number}>({ultimo:0,avisoSinal:0})
  const [auto,setAuto]=useState(lerAuto)
  const movimento=useRef<{estado:EstadoMovimento;ultimaTroca:number}>({estado:ESTADO_INICIAL,ultimaTroca:0})
  // O callback do GPS e criado uma vez; estes refs deixam ele ver o estado atual.
  const atual=useRef<{situacao:SituacaoOp|null;auto:boolean;rotaId:string|null}>({situacao:null,auto:true,rotaId:null})
  atual.current={situacao:rotas.find(r=>r.rota_id===(sel||rotas[0]?.rota_id))?.situacao_operacional??null,auto,rotaId:rid}

  const pararGPS=()=>{
    if(timers.current.watch!==undefined) navigator.geolocation.clearWatch(timers.current.watch)
    if(timers.current.to) clearTimeout(timers.current.to)
    timers.current={ultimo:0,avisoSinal:0}
    setTrack(false)
  }

  // Sem esta limpeza o aparelho continuaria enviando posicao depois que a
  // tela sai do ar.
  useEffect(()=>()=>{ if(timers.current.watch!==undefined) navigator.geolocation.clearWatch(timers.current.watch); if(timers.current.to) clearTimeout(timers.current.to) },[])

  // Tela ligada enquanto o GPS rastreia: num app web o navegador para de ler
  // a posicao quando a tela apaga. O sistema solta o bloqueio se o app sai
  // da frente; ao voltar, pede de novo.
  useEffect(()=>{
    if(!track||!('wakeLock' in navigator)) return
    let trava:WakeLockSentinel|null=null
    const pedir=()=>{ if(document.visibilityState==='visible') navigator.wakeLock.request('screen').then(t=>{trava=t}).catch(()=>{/* bateria fraca ou sem suporte */}) }
    pedir()
    document.addEventListener('visibilitychange',pedir)
    return ()=>{ document.removeEventListener('visibilitychange',pedir); void trava?.release() }
  },[track])

  if(lr) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8"/></div>
  if(!rota) return <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
    <Bus className="mb-4 h-16 w-16 text-white/10"/>
    <p className="text-lg font-semibold">Nenhuma rota atribuída</p>
    <p className="mt-1 text-sm text-white/40">Peça ao administrador para vincular você a uma rota.</p>
  </div>

  const cIda=pax.filter(p=>p.embarcou_ida).length
  const cVolta=pax.filter(p=>p.embarcou_volta).length

  const mudarSit=async(s:SituacaoOp)=>{setBusy(true);try{const r=await atualizarSituacao(rota.rota_id,s);toast(r==='gravado'?`Situação: ${ROTULO_SIT[s]}`:`Situação ${ROTULO_SIT[s]} salva no aparelho, envia quando voltar a internet`);if(r==='gravado')await rr()}catch(e){toast((e as Error).message,'err')}finally{setBusy(false)}}

  const alternarAuto=()=>{ const v=!auto; setAuto(v); try{localStorage.setItem(CHAVE_AUTO,v?'1':'0')}catch{/* segue sem salvar */} }

  /** Situacao automatica (lib/movimento.ts): andou -> Em rota; 5 min parado -> Aguardando. */
  const avaliarMovimento=(p:GeolocationPosition)=>{
    const r=avaliarLeitura(movimento.current.estado,{lat:p.coords.latitude,lng:p.coords.longitude,t:p.timestamp||Date.now(),velocidade:p.coords.speed,precisao:p.coords.accuracy})
    movimento.current.estado=r.estado
    const {situacao,auto:ligado,rotaId}=atual.current
    if(!ligado||!situacao||!rotaId) return
    const nova=situacaoSugerida(situacao,r.movimento)
    if(!nova||Date.now()-movimento.current.ultimaTroca<INTERVALO_AUTO_MS) return
    movimento.current.ultimaTroca=Date.now()
    atualizarSituacao(rotaId,nova)
      .then(()=>{ toast(`Situação atualizada sozinha: ${ROTULO_SIT[nova]}`); return rr() })
      .catch(e=>toast((e as Error).message,'err'))
  }

  /**
   * Rastreamento continuo (watchPosition): o aparelho avisa a cada mudanca
   * de posicao e gravamos no maximo uma a cada 15 s. Cada posicao gravada
   * passa pelo gatilho de raio das universidades no banco, que dispara os
   * avisos de "motorista proximo" e "onibus a caminho".
   */
  const toggleGPS=()=>{
    if(track){ pararGPS(); return }
    if(!('geolocation' in navigator)){toast('Este aparelho não oferece GPS.','err');return}
    const rotaId=rota.rota_id
    setTrack(true)
    movimento.current={estado:ESTADO_INICIAL,ultimaTroca:0}
    timers.current.watch=navigator.geolocation.watchPosition(
      p=>{
        const agora=Date.now()
        setPosicao({lat:p.coords.latitude,lng:p.coords.longitude})
        avaliarMovimento(p)
        // Sem rede a posicao e descartada: gravada depois, dispararia avisos
        // de "onibus chegando" fora de hora (ver lib/filaOffline.ts).
        if(!navigator.onLine) return
        if(agora-timers.current.ultimo<INTERVALO_GPS_MS) return
        timers.current.ultimo=agora
        registrarGPS(rotaId,p.coords.latitude,p.coords.longitude).then(ok=>{ if(ok) atualizarMapa() })
      },
      // So a permissao negada desliga o rastreamento. Sem sinal (tunel,
      // garagem) ou tempo esgotado o aparelho continua tentando sozinho:
      // antes qualquer falha passageira desligava o GPS sem o motorista notar.
      e=>{
        if(e.code===e.PERMISSION_DENIED){ toast('Sem permissão de localização. Libere nas configurações do aparelho.','err'); pararGPS(); return }
        if(Date.now()-timers.current.avisoSinal>60000){ timers.current.avisoSinal=Date.now(); toast('Sinal de GPS fraco. O rastreamento continua ligado.','err') }
      },
      {enableHighAccuracy:true,maximumAge:5000,timeout:20000})
    timers.current.to=window.setTimeout(pararGPS,LIMITE_RASTREIO_MS)
  }

  const responder=async(id:string,aprovar:boolean)=>{
    setDecidindo(id)
    try{ await decidir(id,aprovar,aprovar?undefined:'Recusado pelo motorista'); toast(aprovar?'Volta aprovada':'Pedido recusado') }
    catch(e){ toast((e as Error).message,'err') }
    finally{ setDecidindo(null) }
  }

  const pendentes=sol.filter(s=>s.status==='pendente')

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {rotas.length>1&&<div className="relative">
      <select aria-label="Rota" className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm font-medium text-white" value={sel||rota.rota_id} onChange={e=>setSel(e.target.value)}>
        {rotas.map(r=><option key={r.rota_id} value={r.rota_id}>{r.codigo} — {r.nome}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"/>
    </div>}

    {/* Card da rota */}
    <div className="card space-y-3 anim-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-gold-500">{rota.codigo}</p>
          <h2 className="truncate text-lg font-bold">{rota.nome}</h2>
        </div>
        <span className={`chip flex-shrink-0 ${COR_SIT[rota.situacao_operacional]}`}>{ROTULO_SIT[rota.situacao_operacional]}</span>
      </div>

      {/* Uma coluna no celular estreito: duas colunas cortavam origem/destino */}
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2 text-white/50"><MapPin className="h-4 w-4 flex-shrink-0 text-gold-500/60"/><span className="truncate">{rota.origem} → {rota.destino}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Clock className="h-4 w-4 flex-shrink-0 text-gold-500/60"/><span>{rota.horario_partida?.slice(0,5)} / {rota.horario_retorno?.slice(0,5)}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Bus className="h-4 w-4 flex-shrink-0 text-gold-500/60"/><span className="truncate">{rota.placa} ({rota.modelo})</span></div>
        <div className="flex items-center gap-2 text-white/50"><Users className="h-4 w-4 flex-shrink-0 text-gold-500/60"/><span>{rota.passageiros}/{rota.capacidade_maxima} vagas</span></div>
      </div>

      <div className="flex gap-2">{SITS.map(s=>
        <button key={s} disabled={busy||rota.situacao_operacional===s} onClick={()=>mudarSit(s)}
          className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all ${rota.situacao_operacional===s?'bg-gold-500 text-gold-ink':'border border-white/10 text-white/60 active:bg-white/10'}`}>
          {ROTULO_SIT[s]}
        </button>)}
      </div>

      <button onClick={toggleGPS} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${track?'bg-emerald-500/20 text-emerald-400 anim-pulse':'border border-white/10 text-white/50'}`}>
        <Navigation className="h-4 w-4"/>{track?'GPS ativo, enviando posição':'Ativar rastreamento GPS'}
      </button>

      <button onClick={alternarAuto} role="switch" aria-checked={auto} className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left">
        <Wand2 className={`h-4 w-4 flex-shrink-0 ${auto?'text-gold-500':'text-white/30'}`}/>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Situação automática</span>
          <span className="block text-[11px] text-white/40">{auto?(track?'Andou: Em rota. Parado 5 min: Aguardando.':'Liga junto com o rastreamento GPS.'):'Desligada: troque a situação nos botões.'}</span>
        </span>
        <span className={`relative h-6 w-10 flex-shrink-0 rounded-full transition-colors ${auto?'bg-gold-500':'bg-white/15'}`} aria-hidden="true">
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-navy-900 shadow transition-all ${auto?'left-[18px]':'left-0.5'}`}/>
        </span>
      </button>
    </div>

    {/* Mapa com o raio de aviso de cada universidade */}
    <div className="card space-y-3 anim-in">
      <div className="flex items-center gap-2">
        <IconeMapa className="h-4 w-4 text-gold-500"/>
        <h3 className="text-sm font-semibold">Trajeto e raios de aviso</h3>
      </div>
      <MapaMotorista dados={mapa} carregando={carregandoMapa} posicao={posicao}/>
      {!track&&<p className="text-[11px] text-white/40">Ative o rastreamento GPS para os alunos receberem o aviso de aproximação.</p>}
    </div>

    {/* Resumo do dia, com atalho para a aba de check-in */}
    <div className="flex gap-2">
      <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 py-3 text-center">
        <span className="block text-2xl font-extrabold text-emerald-400">{cIda}</span>
        <span className="text-[10px] uppercase tracking-wider text-emerald-400/70">Ida</span>
      </div>
      <div className="flex-1 rounded-xl border border-blue-500/20 bg-blue-500/10 py-3 text-center">
        <span className="block text-2xl font-extrabold text-blue-400">{cVolta}</span>
        <span className="text-[10px] uppercase tracking-wider text-blue-400/70">Volta</span>
      </div>
      <div className="flex-1 rounded-xl border border-white/10 py-3 text-center">
        <span className="block text-2xl font-extrabold text-white/70">{pax.length}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">Alunos</span>
      </div>
    </div>

    <button onClick={onIrParaCheckIn} className="btn-gold flex items-center justify-center gap-2">
      <ScanLine className="h-4 w-4"/>Fazer check-in dos alunos
    </button>

    {/* Solicitações de volta */}
    {pendentes.length>0&&<>
      <h3 className="mt-2 text-sm font-semibold text-amber-400">Pedidos de volta pendentes</h3>
      {pendentes.map(s=><div key={s.id} className="card space-y-3">
        <p className="text-sm font-semibold">{s.estudante_nome||'Estudante'}</p>
        <p className="text-xs italic text-white/50">"{s.justificativa}"</p>
        <div className="flex gap-2">
          <button onClick={()=>responder(s.id,true)} disabled={decidindo===s.id} className="flex flex-1 items-center justify-center rounded-xl bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-400">
            {decidindo===s.id?<Spinner className="h-4 w-4"/>:'Aprovar'}
          </button>
          <button onClick={()=>responder(s.id,false)} disabled={decidindo===s.id} className="flex-1 rounded-xl bg-rose-500/20 py-2.5 text-xs font-semibold text-rose-400">Recusar</button>
        </div>
      </div>)}
    </>}

    {/* Trocas de onibus: o aluno cancelou a volta na rota dele e pediu vaga nesta */}
    {trocas.length>0&&<>
      <h3 className="mt-2 text-sm font-semibold text-amber-400">Trocas de ônibus pendentes</h3>
      {trocas.map(t=><div key={t.id} className="card space-y-3">
        <div>
          <p className="text-sm font-semibold">{t.estudante}</p>
          <p className="text-[11px] text-white/50">
            Prontuário {t.prontuario}{t.rota_origem?` · vinha da rota ${t.rota_origem}`:''}
          </p>
        </div>
        {t.justificativa&&<p className="text-xs italic text-white/50">"{t.justificativa}"</p>}
        <div className="flex gap-2">
          <button
            onClick={async()=>{setDecidindoTroca(t.id);try{await decidirTroca(t.id,true);toast('Troca aceita. O aluno volta com você.')}catch(e){toast((e as Error).message,'err')}finally{setDecidindoTroca(null)}}}
            disabled={decidindoTroca===t.id}
            className="flex flex-1 items-center justify-center rounded-xl bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-400"
          >
            {decidindoTroca===t.id?<Spinner className="h-4 w-4"/>:'Aceitar'}
          </button>
          <button
            onClick={async()=>{setDecidindoTroca(t.id);try{await decidirTroca(t.id,false,'Sem vaga disponível')}catch(e){toast((e as Error).message,'err')}finally{setDecidindoTroca(null)}}}
            disabled={decidindoTroca===t.id}
            className="flex-1 rounded-xl bg-rose-500/20 py-2.5 text-xs font-semibold text-rose-400"
          >
            Recusar
          </button>
        </div>
      </div>)}
    </>}
  </div>
}
