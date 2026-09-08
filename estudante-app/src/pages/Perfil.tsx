import { Bus, GraduationCap, LogOut, Shield, Smartphone } from 'lucide-react'
import { useMinhaRota, ROTULO_PERFIL } from '@/hooks/useEstudante'
import type { Perfil as P } from '@/hooks/useAuth'

export function Perfil({perfil,estudanteId,onLogout}:{perfil:P;estudanteId:string|null;onLogout:()=>void}){
  const {rota:data}=useMinhaRota()
  const est=data?.estudante

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="card flex flex-col items-center py-8 anim-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/10 text-3xl font-bold text-brand-500 mb-4">{perfil.nome.charAt(0)}</div>
      <h2 className="text-xl font-bold">{perfil.nome}</h2>
      <div className="mt-2 flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-brand-500"/><span className="text-xs font-medium text-brand-500 uppercase tracking-wider">Estudante</span></div>
      {est&&<div className="mt-3 space-y-1 text-center text-xs text-white/40">
        <p>Prontuario: {est.prontuario}</p>
        {est.curso&&<p>{est.curso}</p>}
        {est.universidade&&<p>{est.universidade}</p>}
        <p>Perfil de uso: {ROTULO_PERFIL[est.perfil_uso]}</p>
        <p>Documentacao: <span className={est.status_documental==='aprovado'?'text-emerald-400':est.status_documental==='pendente'?'text-amber-400':'text-rose-400'}>{est.status_documental}</span></p>
      </div>}
    </div>

    {data?.rota&&<div className="card anim-in">
      <h3 className="text-sm font-semibold text-white/50 mb-2">Minha rota</h3>
      <p className="text-xs font-semibold text-brand-500">{data.rota.codigo}</p>
      <p className="text-sm font-bold">{data.rota.nome}</p>
      <p className="text-xs text-white/40 mt-1">{data.rota.origem} \u2192 {data.rota.destino}</p>
    </div>}

    <div className="card space-y-3 anim-in"><div className="flex items-center gap-3 text-sm text-white/40"><Smartphone className="h-4 w-4"/><span>GTPORTE Estudante v1.0</span></div>
      <p className="text-[10px] text-white/20">Instale na tela inicial do celular para acesso rapido.</p></div>
    <button onClick={onLogout} className="btn-danger flex items-center justify-center gap-2"><LogOut className="h-4 w-4"/>Sair da conta</button>
  </div>}
