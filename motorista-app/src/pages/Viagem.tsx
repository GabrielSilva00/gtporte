import { useState } from 'react'
import { Bus, Check, ChevronDown, Clock, MapPin, Navigation, RefreshCw, Users, X, Undo2 } from 'lucide-react'
import { useRotas, usePassageiros, useSolicitacoesVolta, atualizarSituacao, registrarGPS, confirmarPresenca, cancelarPresenca, ROTULO_SIT, COR_SIT } from '@/hooks/useMotorista'
import type { SituacaoOp, Pax } from '@/hooks/useMotorista'
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
  const [checkinBusy,setCheckinBusy]=useState<string|null>(null)
  const [trecho,setTrecho]=useState<'ida'|'volta'>('ida')
  const [showCanc,setShowCanc]=useState<{estudanteId:string;nome:string;trecho:'ida'|'volta'}|null>(null)
  const [cancMotivo,setCancMotivo]=useState('')
  const hoje=new Date().toISOString().slice(0,10)

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

  const checkin=async(p:Pax)=>{
    const key=`${p.estudante_id}-${trecho}`
    setCheckinBusy(key)
    try{
      const r=await confirmarPresenca(p.estudante_id,trecho,hoje)
      toast(r.mensagem); await rp()
    }catch(e){toast((e as Error).message,'err')}
    finally{setCheckinBusy(null)}
  }

  const doCancel=async()=>{
    if(!showCanc||!cancMotivo.trim()) return
    setCheckinBusy(`${showCanc.estudanteId}-canc`)
    try{
      const r=await cancelarPresenca(showCanc.estudanteId,showCanc.trecho,cancMotivo.trim(),hoje)
      toast(r.mensagem); await rp(); setShowCanc(null); setCancMotivo('')
    }catch(e){toast((e as Error).message,'err')}
    finally{setCheckinBusy(null)}
  }

  const pendentes=sol.filter(s=>s.status==='pendente')
  const jaConfirmou=(p:Pax)=>trecho==='ida'?p.confirmou_ida:p.confirmou_volta

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {rotas.length>1&&<div className="relative"><select className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm font-medium text-white" value={sel||rota.rota_id} onChange={e=>setSel(e.target.value)}>
      {rotas.map(r=><option key={r.rota_id} value={r.rota_id}>{r.codigo} — {r.nome}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 pointer-events-none"/></div>}

    {/* Card da rota */}
    <div className="card space-y-3 anim-in">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-semibold text-gold-500 tracking-wider">{rota.codigo}</p><h2 className="text-lg font-bold">{rota.nome}</h2></div>
        <span className={`chip ${COR_SIT[rota.situacao_operacional]}`}>{ROTULO_SIT[rota.situacao_operacional]}</span></div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-white/50"><MapPin className="h-4 w-4 text-gold-500/60"/><span className="truncate">{rota.origem} → {rota.destino}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Clock className="h-4 w-4 text-gold-500/60"/><span>{rota.horario_partida?.slice(0,5)} / {rota.horario_retorno?.slice(0,5)}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Bus className="h-4 w-4 text-gold-500/60"/><span>{rota.placa} ({rota.modelo})</span></div>
        <div className="flex items-center gap-2 text-white/50"><Users className="h-4 w-4 text-gold-500/60"/><span>{rota.passageiros}/{rota.capacidade_maxima} vagas</span></div></div>
      <div className="flex gap-2">{SITS.map(s=><button key={s} disabled={busy||rota.situacao_operacional===s} onClick={()=>mudarSit(s)} className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-all ${rota.situacao_operacional===s?'bg-gold-500 text-navy-900':'border border-white/10 text-white/60 active:bg-white/10'}`}>{ROTULO_SIT[s]}</button>)}</div>
      <button onClick={toggleGPS} className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${track?'bg-emerald-500/20 text-emerald-400 anim-pulse':'border border-white/10 text-white/50'}`}><Navigation className="h-4 w-4"/>{track?'GPS ativo, enviando posição...':'Ativar rastreamento GPS'}</button>
    </div>

    {/* Seletor ida/volta + KPIs */}
    <div className="flex gap-2">
      <button onClick={()=>setTrecho('ida')} className={`flex-1 rounded-xl py-3 text-center font-semibold transition-all ${trecho==='ida'?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':'border border-white/10 text-white/40'}`}>
        <span className="text-2xl font-extrabold block">{cIda}</span><span className="text-[10px] uppercase tracking-wider">Check-in Ida</span>
      </button>
      <button onClick={()=>setTrecho('volta')} className={`flex-1 rounded-xl py-3 text-center font-semibold transition-all ${trecho==='volta'?'bg-blue-500/20 text-blue-400 border border-blue-500/30':'border border-white/10 text-white/40'}`}>
        <span className="text-2xl font-extrabold block">{cVolta}</span><span className="text-[10px] uppercase tracking-wider">Check-in Volta</span>
      </button>
    </div>

    {/* Header passageiros */}
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-white/60">Passageiros ({pax.length})</h3>
      <button onClick={rp} className="rounded-lg p-2 text-white/30 active:bg-white/5"><RefreshCw className={`h-4 w-4 ${lp?'animate-spin':''}`}/></button>
    </div>

    {/* Lista de passageiros com check-in/out */}
    {pax.length===0&&!lp?<p className="py-8 text-center text-sm text-white/30">Nenhum passageiro nesta rota.</p>:
    <div className="space-y-2">{pax.map((p,i)=>{
      const confirmado=jaConfirmou(p)
      const isBusy=checkinBusy===`${p.estudante_id}-${trecho}`
      return <div key={p.alocacao_id} className={`card flex items-center gap-3 anim-in ${confirmado?'border-emerald-500/20':''}`} style={{animationDelay:`${i*30}ms`}}>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${confirmado?'bg-emerald-500/20 text-emerald-400':'bg-gold-500/10 text-gold-500'}`}>
          {confirmado?<Check className="h-5 w-5"/>:p.nome.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.nome}</p>
          <p className="truncate text-xs text-white/40">{p.prontuario} · {p.universidade||p.curso}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {confirmado ? (
            <button onClick={()=>setShowCanc({estudanteId:p.estudante_id,nome:p.nome,trecho})}
              className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-[10px] font-semibold text-white/40 active:bg-rose-500/10 active:text-rose-400">
              <Undo2 className="h-3 w-3"/>Desfazer
            </button>
          ) : (
            <button onClick={()=>checkin(p)} disabled={!!checkinBusy}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-400 active:scale-95 transition-transform">
              {isBusy?<Spinner className="h-4 w-4"/>:<><Check className="h-4 w-4"/>Check-in</>}
            </button>
          )}
        </div>
      </div>
    })}</div>}

    {/* Modal cancelar presença */}
    {showCanc&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>{setShowCanc(null);setCancMotivo('')}}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Cancelar presença</h3>
          <button onClick={()=>{setShowCanc(null);setCancMotivo('')}}><X className="h-5 w-5 text-white/40"/></button></div>
        <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-400 mb-4">
          Cancelar {showCanc.trecho} de <strong>{showCanc.nome}</strong>
        </div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">Motivo (obrigatório)</label>
        <textarea className="input-dark min-h-[80px] resize-none" placeholder="Descreva o motivo do cancelamento..." value={cancMotivo} onChange={e=>setCancMotivo(e.target.value)} autoFocus/>
        <button onClick={doCancel} disabled={!cancMotivo.trim()||!!checkinBusy}
          className="btn-red mt-4 flex items-center justify-center gap-2">
          {checkinBusy?<Spinner/>:<><X className="h-4 w-4"/>Confirmar cancelamento</>}
        </button>
      </div>
    </div>}

    {/* Solicitações de volta */}
    {pendentes.length>0&&<><h3 className="mt-4 text-sm font-semibold text-amber-400">Solicitações de volta pendentes</h3>
      {pendentes.map(s=><div key={s.id} className="card space-y-3">
        <p className="text-sm"><span className="font-semibold">{s.estudante_nome||'Estudante'}</span></p>
        <p className="text-xs text-white/50 italic">"{s.justificativa}"</p>
        <div className="flex gap-2"><button onClick={()=>decidir(s.id,true)} className="flex-1 rounded-xl bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-400">Aprovar</button>
          <button onClick={()=>decidir(s.id,false,'Recusado pelo motorista')} className="flex-1 rounded-xl bg-rose-500/20 py-2.5 text-xs font-semibold text-rose-400">Recusar</button></div>
      </div>)}</>}
  </div>
}
