import { useState } from 'react'
import { Bus, ChevronLeft, ChevronRight, Clock, History, LogOut, MapPin, MessageCircle, Shield, Smartphone } from 'lucide-react'
import { useRotas } from '@/hooks/useMotorista'
import type { Perfil as P } from '@/hooks/useAuth'
import { Historico } from '@/pages/Historico'
import { Mensagens } from '@/pages/Mensagens'
import { Spinner } from '@/components/Spinner'

type Sub='historico'|'mensagens'|null

export function Perfil({perfil,onLogout}:{perfil:P;onLogout:()=>void}){
  const {rotas,loading}=useRotas()
  const [sub,setSub]=useState<Sub>(null)

  if(sub) return <div>
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/[0.06] bg-navy-900/95 px-2 py-3 backdrop-blur-xl">
      <button onClick={()=>setSub(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-white/60 active:bg-white/5">
        <ChevronLeft className="h-5 w-5"/>Perfil
      </button>
    </div>
    {sub==='historico'?<Historico/>:<Mensagens/>}
  </div>

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="card flex flex-col items-center py-8 anim-in">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gold-500/10 text-3xl font-bold text-gold-500">{perfil.nome.charAt(0)}</div>
      <h2 className="text-center text-xl font-bold">{perfil.nome}</h2>
      <div className="mt-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-gold-500"/><span className="text-xs font-medium uppercase tracking-wider text-gold-500">Motorista</span></div>
      {perfil.login&&<p className="mt-1 text-xs text-white/30">Login: {perfil.login}</p>}
    </div>

    <div className="space-y-2">
      {([['historico',History,'Histórico de viagens'],['mensagens',MessageCircle,'Mensagens']] as const).map(([id,Icone,rotulo])=>
        <button key={id} onClick={()=>setSub(id)} className="card flex w-full items-center gap-3 text-left active:bg-white/[0.03]">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500"><Icone className="h-5 w-5"/></div>
          <span className="flex-1 text-sm font-semibold">{rotulo}</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/20"/>
        </button>)}
    </div>

    <h3 className="text-sm font-semibold text-white/50">Minhas rotas</h3>
    {loading?<div className="flex justify-center py-6"><Spinner/></div>:
     rotas.length===0?<p className="py-4 text-center text-sm text-white/30">Nenhuma rota atribuída</p>:
     <div className="space-y-2">{rotas.map(r=><div key={r.rota_id} className="card anim-in">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gold-500">{r.codigo}</p>
            <p className="truncate text-sm font-bold">{r.nome}</p>
          </div>
          <span className="chip flex-shrink-0 bg-white/5 text-[10px] text-white/40">{r.status}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3 flex-shrink-0"/>{r.origem} → {r.destino}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 flex-shrink-0"/>{r.horario_partida?.slice(0,5)} / {r.horario_retorno?.slice(0,5)}</span>
          <span className="flex items-center gap-1"><Bus className="h-3 w-3 flex-shrink-0"/>{r.placa}</span>
        </div>
      </div>)}</div>}

    <div className="card space-y-3 anim-in">
      <div className="flex items-center gap-3 text-sm text-white/40"><Smartphone className="h-4 w-4"/><span>GTPORTE Motorista v1.0</span></div>
      <p className="text-[10px] text-white/20">Instale este app na tela inicial do celular para acesso rápido e uso offline.</p>
    </div>

    <button onClick={onLogout} className="btn-red flex items-center justify-center gap-2"><LogOut className="h-4 w-4"/>Sair da conta</button>
  </div>
}
