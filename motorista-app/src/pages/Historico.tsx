import { History, Users } from 'lucide-react'
import { useHistorico } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'

export function Historico() {
  const {hist,loading}=useHistorico()
  const fmt=(d:string)=>{const [y,m,day]=d.split('-');return `${day}/${m}/${y}`}

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <h2 className="text-lg font-bold">Histórico de Viagens</h2>
    <p className="text-xs text-white/40">Últimos 30 dias</p>

    {loading?<div className="flex justify-center py-12"><Spinner/></div>:hist.length===0?
      <div className="flex flex-col items-center py-12 text-center"><History className="h-12 w-12 text-white/10 mb-3"/><p className="text-sm text-white/40">Nenhum registro encontrado</p></div>:
      <div className="space-y-2">{hist.map((h,i)=>(
        <div key={h.data} className="card flex items-center gap-3 anim-in" style={{animationDelay:`${i*30}ms`}}>
          <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-500"><History className="h-5 w-5"/></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{fmt(h.data)}</p>
            <p className="text-xs text-white/40 truncate">{h.rota_codigo} — {h.rota_nome}</p>
          </div>
          <div className="flex gap-3 text-xs">
            <div className="text-center"><span className="block text-lg font-bold text-emerald-400">{h.total_ida}</span><span className="text-white/30">ida</span></div>
            <div className="text-center"><span className="block text-lg font-bold text-blue-400">{h.total_volta}</span><span className="text-white/30">volta</span></div>
          </div>
        </div>
      ))}</div>}
  </div>
}
