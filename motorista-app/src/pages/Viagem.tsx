import { useState } from 'react'
import { Bus, ChevronDown, Clock, MapPin, Navigation, RefreshCw, Users } from 'lucide-react'
import { useRotas, usePassageiros, useSolicitacoesVolta, atualizarSituacao, registrarGPS, ROTULO_SIT, COR_SIT } from '@/hooks/useMotorista'
import type { SituacaoOp } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const SITS:SituacaoOp[]=['aguardando','em_rota','concluida']

export function Viagem(){
  const {rotas,loading:lr,refresh:rr}=useRotas()
  const [sel,setSel]=useState<string|null>(null)
  const rota=rotas.find(r=>r.rota_id===sel)||rotas[0]||null
  const rid=rota?.rota_id||null
  const {pax,loading:lp,refresh:rp}=usePassageiros(rid)
  const {sol,decidir}=useSolicitacoesVolta(rid)
  const [track,setTrack]=useState(false)
  const [busy,setBusy]=useState(false)

  if(lr) return <div className="flex flex-1 items-center justify-center pt-20"><Spinner className="h-8 w-8"/></div>
  if(!rota) return <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center"><Bus className="h-16 w-16 text-white/10 mb-4"/><p className="text-lg font-semibold">Nenhuma rota atribuída</p><p className="mt-1 text-sm text-white/40">Peça ao administrador para vincular você a uma rota.</p></div>

  const cIda=pax.filter(p=>p.confirmou_ida).length; const cVolta=pax.filter(p=>p.confirmou_volta).length

  const mudarSit=async(s:SituacaoOp)=>{setBusy(true);try{await atualizarSituacao(rota.rota_id,s);toast(`Situação: ${ROTULO_SIT[s]}`);await rr()}catch(e){toast((e as Error).message,'err')}finally{setBusy(false)}}

  const toggleGPS=()=>{
    if(track){setTrack(false);return}
    if(!('geolocation' in navigator)){toast('GPS indisponível','err');return}
    setTrack(true)
    const send=()=>navigator.geolocation.getCurrentPosition(p=>registrarGPS(rota.rota_id,p.coords.latitude,p.coords.longitude),()=>{},{enableHighAccuracy:true})
    send(); const iv=setInterval(send,30000); setTimeout(()=>{clearInterval(iv);setTrack(false)},3600000)
  }

  const pendentes=sol.filter(s=>s.status==='pendente')

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {rotas.length>1&&<div className="relative"><select className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm font-medium text-white" value={sel||rota.rota_id} onChange={e=>setSel(e.target.value)}>
      {rotas.map(r=><option key={r.rota_id} value={r.rota_id}>{r.codigo} — {r.nome}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 pointer-events-none"/></div>}

    <div className="card space-y-3 anim-in">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-semibold text-gold-500 tracking-wider">{rota.codigo}</p><h2 className="text-lg font-bold">{rota.nome}</h2></div>
        <span className={`chip ${COR_SIT[rota.situacao_operacional]}`}>{ROTULO_SIT[rota.situacao_operacional]}</span></div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-white/50"><MapPin className="h-4 w-4 text-gold-500/60"/><span>{rota.origem} → {rota.destino}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Clock className="h-4 w-4 text-gold-500/60"/><span>{rota.horario_partida?.slice(0,5)} / {rota.horario_retorno?.slice(0,5)}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Bus className="h-4 w-4 text-gold-500/60"/><span>{rota.placa} ({rota.modelo})</span></div>
        <div className="flex items-center gap-2 text-white/50"><Users className="h-4 w-4 text-gold-500/60"/><span>{rota.passageiros}/{rota.capacidade_maxima} vagas</span></div></div>
      <div className="flex gap-2">{SITS.map(s=><button key={s} disabled={busy||rota.situacao_operacional===s} onClick={()=>mudarSit(s)} className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all ${rota.situacao_operacional===s?'bg-gold-500 text-navy-900':'border border-white/10 text-white/60 active:bg-white/10'}`}>{ROTULO_SIT[s]}</button>)}</div>
      <button onClick={toggleGPS} className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${track?'bg-emerald-500/20 text-emerald-400 anim-pulse':'border border-white/10 text-white/50'}`}><Navigation className="h-4 w-4"/>{track?'GPS ativo, enviando posição...':'Ativar rastreamento GPS'}</button>
    </div>

    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white/60">Passageiros ({pax.length})</h3>
      <button onClick={rp} className="rounded-lg p-2 text-white/30 active:bg-white/5"><RefreshCw className={`h-4 w-4 ${lp?'animate-spin':''}`}/></button></div>

    <div className="flex gap-3 text-center text-xs text-white/50">
      <div className="flex-1 rounded-xl bg-emerald-500/10 py-2"><span className="text-lg font-bold text-emerald-400">{cIda}</span><p>Ida confirmada</p></div>
      <div className="flex-1 rounded-xl bg-blue-500/10 py-2"><span className="text-lg font-bold text-blue-400">{cVolta}</span><p>Volta confirmada</p></div></div>

    {pax.length===0&&!lp?<p className="py-8 text-center text-sm text-white/30">Nenhum passageiro nesta rota.</p>:
    <div className="space-y-2">{pax.map((p,i)=><div key={p.alocacao_id} className="card flex items-center gap-3 anim-in" style={{animationDelay:`${i*40}ms`}}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-sm font-bold text-gold-500">{p.nome.charAt(0)}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.nome}</p><p className="truncate text-xs text-white/40">{p.prontuario} · {p.universidade||p.curso}</p></div>
      <div className="flex flex-col items-end gap-1">
        <span className={`chip text-[10px] ${p.confirmou_ida?'bg-emerald-500/20 text-emerald-400':'bg-white/5 text-white/25'}`}>Ida {p.confirmou_ida?'✓':'—'}</span>
        <span className={`chip text-[10px] ${p.confirmou_volta?'bg-blue-500/20 text-blue-400':'bg-white/5 text-white/25'}`}>Volta {p.confirmou_volta?'✓':'—'}</span></div>
    </div>)}</div>}

    {pendentes.length>0&&<><h3 className="mt-4 text-sm font-semibold text-amber-400">Solicitações de volta pendentes</h3>
      {pendentes.map(s=><div key={s.id} className="card space-y-3">
        <p className="text-sm"><span className="font-semibold">{s.estudante_nome||'Estudante'}</span></p>
        <p className="text-xs text-white/50 italic">"{s.justificativa}"</p>
        <div className="flex gap-2"><button onClick={()=>decidir(s.id,true)} className="flex-1 rounded-xl bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-400">Aprovar</button>
          <button onClick={()=>decidir(s.id,false,'Recusado pelo motorista')} className="flex-1 rounded-xl bg-rose-500/20 py-2.5 text-xs font-semibold text-rose-400">Recusar</button></div>
      </div>)}</>}
  </div>}
