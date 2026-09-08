import { useEffect, useState } from 'react'
import { History, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'

interface Reg { data:string; trecho:string; hora:string }

export function Historico({estudanteId}:{estudanteId:string}){
  const [hist,setHist]=useState<Reg[]>([]);const [loading,setLoading]=useState(true)
  useEffect(()=>{(async()=>{
    const desde=new Date();desde.setDate(desde.getDate()-30)
    const{data}=await supabase.from('presenca').select('data,trecho,hora').eq('estudante_id',estudanteId).gte('data',desde.toISOString().slice(0,10)).order('data',{ascending:false})
    setHist((data as Reg[])||[]);setLoading(false)
  })()},[estudanteId])

  const fmt=(d:string)=>{const[y,m,day]=d.split('-');return`${day}/${m}`}

  if(loading)return <div className="flex justify-center py-12"><Spinner/></div>

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <h2 className="text-lg font-bold">Historico de Presenca</h2>
    <p className="text-xs text-white/40">Ultimos 30 dias</p>
    {hist.length===0?<div className="flex flex-col items-center py-12 text-center"><History className="h-12 w-12 text-white/10 mb-3"/><p className="text-sm text-white/40">Nenhum registro</p></div>:
    <div className="space-y-2">{hist.map((h,i)=>(
      <div key={`${h.data}-${h.trecho}`} className="card flex items-center gap-3 anim-in" style={{animationDelay:`${i*30}ms`}}>
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500"><Calendar className="h-5 w-5"/></div>
        <div className="flex-1"><p className="text-sm font-semibold">{fmt(h.data)}</p><p className="text-xs text-white/40">{h.hora?.slice(0,5)}</p></div>
        <span className={`chip ${h.trecho==='ida'?'bg-emerald-500/20 text-emerald-400':'bg-blue-500/20 text-blue-400'}`}>{h.trecho==='ida'?'Ida':'Volta'}</span>
      </div>
    ))}</div>}
  </div>}
