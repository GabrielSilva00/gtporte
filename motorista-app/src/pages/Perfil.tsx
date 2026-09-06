import { Bus, Clock, LogOut, MapPin, Shield, Smartphone } from 'lucide-react'
import { useRotas } from '@/hooks/useMotorista'; import type { Perfil as P } from '@/hooks/useAuth'
export function Perfil({perfil,onLogout}:{perfil:P;onLogout:()=>void}){
  const {rotas}=useRotas()
  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="card flex flex-col items-center py-8 anim-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-500/10 text-3xl font-bold text-gold-500 mb-4">{perfil.nome.charAt(0)}</div>
      <h2 className="text-xl font-bold">{perfil.nome}</h2>
      <div className="mt-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-gold-500"/><span className="text-xs font-medium text-gold-500 uppercase tracking-wider">Motorista</span></div>
      {perfil.login&&<p className="mt-1 text-xs text-white/30">Login: {perfil.login}</p>}</div>
    <h3 className="text-sm font-semibold text-white/50">Minhas rotas</h3>
    {rotas.length===0?<p className="text-sm text-white/30 py-4 text-center">Nenhuma rota atribuída</p>:
      <div className="space-y-2">{rotas.map(r=><div key={r.rota_id} className="card anim-in">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-gold-500">{r.codigo}</p><p className="text-sm font-bold">{r.nome}</p></div>
          <span className="chip bg-white/5 text-white/40 text-[10px]">{r.status}</span></div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/>{r.origem} → {r.destino}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3"/>{r.horario_partida?.slice(0,5)} / {r.horario_retorno?.slice(0,5)}</span>
          <span className="flex items-center gap-1"><Bus className="h-3 w-3"/>{r.placa}</span></div>
      </div>)}</div>}
    <div className="card space-y-3 anim-in"><div className="flex items-center gap-3 text-sm text-white/40"><Smartphone className="h-4 w-4"/><span>GTPORTE Motorista v1.0</span></div>
      <p className="text-[10px] text-white/20">Instale este app na tela inicial do celular para acesso rápido e uso offline.</p></div>
    <button onClick={onLogout} className="btn-red flex items-center justify-center gap-2"><LogOut className="h-4 w-4"/>Sair da conta</button>
  </div>}
