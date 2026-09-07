import { useEffect, useRef, useState } from 'react'
import { Bus, ChevronDown, Clock, MapPin, Navigation, ScanLine, Users } from 'lucide-react'
import { useRotas, usePassageiros, useSolicitacoesVolta, atualizarSituacao, registrarGPS, ROTULO_SIT, COR_SIT } from '@/hooks/useMotorista'
import type { SituacaoOp } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const SITS:SituacaoOp[]=['aguardando','em_rota','concluida']

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
  const [track,setTrack]=useState(false)
  const [busy,setBusy]=useState(false)
  const [decidindo,setDecidindo]=useState<string|null>(null)
  const timers=useRef<{iv?:number;to?:number}>({})

  // O rastreamento roda em intervalos; sem esta limpeza ele continuaria
  // enviando posicao depois que a tela sai do ar.
  useEffect(()=>()=>{ if(timers.current.iv) clearInterval(timers.current.iv); if(timers.current.to) clearTimeout(timers.current.to) },[])

  if(lr) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8"/></div>
  if(!rota) return <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
    <Bus className="mb-4 h-16 w-16 text-white/10"/>
    <p className="text-lg font-semibold">Nenhuma rota atribuída</p>
    <p className="mt-1 text-sm text-white/40">Peça ao administrador para vincular você a uma rota.</p>
  </div>

  const cIda=pax.filter(p=>p.confirmou_ida).length
  const cVolta=pax.filter(p=>p.confirmou_volta).length

  const mudarSit=async(s:SituacaoOp)=>{setBusy(true);try{await atualizarSituacao(rota.rota_id,s);toast(`Situação: ${ROTULO_SIT[s]}`);await rr()}catch(e){toast((e as Error).message,'err')}finally{setBusy(false)}}

  const toggleGPS=()=>{
    if(track){
      if(timers.current.iv) clearInterval(timers.current.iv)
      if(timers.current.to) clearTimeout(timers.current.to)
      setTrack(false); return
    }
    if(!('geolocation' in navigator)){toast('Este aparelho não oferece GPS.','err');return}
    setTrack(true)
    const enviar=()=>navigator.geolocation.getCurrentPosition(
      p=>registrarGPS(rota.rota_id,p.coords.latitude,p.coords.longitude),
      ()=>toast('Não foi possível ler a posição. Verifique a permissão de localização.','err'),
      {enableHighAccuracy:true})
    enviar()
    timers.current.iv=window.setInterval(enviar,30000)
    timers.current.to=window.setTimeout(()=>{ if(timers.current.iv) clearInterval(timers.current.iv); setTrack(false) },3600000)
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
          className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all ${rota.situacao_operacional===s?'bg-gold-500 text-navy-900':'border border-white/10 text-white/60 active:bg-white/10'}`}>
          {ROTULO_SIT[s]}
        </button>)}
      </div>

      <button onClick={toggleGPS} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${track?'bg-emerald-500/20 text-emerald-400 anim-pulse':'border border-white/10 text-white/50'}`}>
        <Navigation className="h-4 w-4"/>{track?'GPS ativo, enviando posição':'Ativar rastreamento GPS'}
      </button>
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
  </div>
}
