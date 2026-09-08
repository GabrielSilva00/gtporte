import { useEffect, useState } from 'react'; import { CheckCircle, XCircle, X } from 'lucide-react'
let fn:((m:string,t?:'ok'|'err')=>void)|null=null
export function toast(m:string,t:'ok'|'err'='ok'){fn?.(m,t)}
export function ToastContainer(){
  const [q,setQ]=useState<{id:number;m:string;t:'ok'|'err'}[]>([])
  useEffect(()=>{fn=(m,t='ok')=>{const id=Date.now();setQ(p=>[...p,{id,m,t}]);setTimeout(()=>setQ(p=>p.filter(x=>x.id!==id)),3500)};return()=>{fn=null}},[])
  return <div className="fixed inset-x-4 top-[env(safe-area-inset-top,12px)] z-[100] flex flex-col gap-2 pt-2">
    {q.map(x=><div key={x.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl anim-in ${x.t==='ok'?'bg-emerald-500/90':'bg-rose-500/90'} text-white`}>
      {x.t==='ok'?<CheckCircle className="h-5 w-5"/>:<XCircle className="h-5 w-5"/>}<span className="flex-1">{x.m}</span>
      <button onClick={()=>setQ(p=>p.filter(y=>y.id!==x.id))}><X className="h-4 w-4 opacity-60"/></button></div>)}
  </div>}
