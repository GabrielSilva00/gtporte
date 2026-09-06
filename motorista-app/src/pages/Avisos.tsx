import { useState } from 'react'; import { Bell, Plus, Send, Trash2, X } from 'lucide-react'
import { useRotas, useAvisos } from '@/hooks/useMotorista'; import { Spinner } from '@/components/Spinner'; import { toast } from '@/components/Toast'
export function Avisos(){
  const {rotas,loading:lr}=useRotas(); const rota=rotas[0]||null
  const {avisos,loading,enviar,excluir}=useAvisos(rota?.rota_id||null)
  const [show,setShow]=useState(false);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false)
  if(lr)return <div className="flex flex-1 items-center justify-center pt-20"><Spinner className="h-8 w-8"/></div>
  if(!rota)return <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center"><Bell className="h-16 w-16 text-white/10 mb-4"/><p className="text-lg font-semibold">Nenhuma rota atribuída</p></div>
  const send=async()=>{if(!msg.trim())return;setBusy(true);try{await enviar(msg.trim());setMsg('');setShow(false);toast('Aviso enviado')}catch(e){toast((e as Error).message,'err')}finally{setBusy(false)}}
  const del=async(id:string)=>{try{await excluir(id);toast('Aviso removido')}catch(e){toast((e as Error).message,'err')}}
  const fmt=(d:string)=>{const dt=new Date(d);return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Avisos da rota</h2>
      <button onClick={()=>setShow(true)} className="flex items-center gap-1.5 rounded-xl bg-gold-500 px-4 py-2.5 text-xs font-bold text-navy-900"><Plus className="h-4 w-4"/>Novo</button></div>
    <p className="text-xs text-white/40">Rota {rota.codigo} · Os passageiros veem esses avisos</p>
    {show&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShow(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Novo aviso</h3><button onClick={()=>setShow(false)}><X className="h-5 w-5 text-white/40"/></button></div>
        <textarea className="input-dark min-h-[120px] resize-none" placeholder="Ex: Ônibus sairá 15 min mais cedo amanhã..." value={msg} onChange={e=>setMsg(e.target.value)} autoFocus/>
        <button onClick={send} disabled={busy||!msg.trim()} className="btn-gold mt-4 flex items-center justify-center gap-2">{busy?<Spinner/>:<><Send className="h-4 w-4"/>Enviar aviso</>}</button>
      </div></div>}
    {loading?<div className="flex justify-center py-12"><Spinner/></div>:avisos.length===0?
      <div className="flex flex-col items-center py-12 text-center"><Bell className="h-12 w-12 text-white/10 mb-3"/><p className="text-sm text-white/40">Nenhum aviso publicado</p></div>:
      <div className="space-y-3">{avisos.map((a,i)=><div key={a.id} className="card anim-in" style={{animationDelay:`${i*40}ms`}}>
        <div className="flex items-start justify-between gap-3"><div className="flex-1"><p className="text-sm leading-relaxed">{a.mensagem}</p><p className="mt-2 text-[10px] text-white/30">{fmt(a.criado_em)}</p></div>
          <button onClick={()=>del(a.id)} className="flex-shrink-0 rounded-lg p-2 text-white/20 active:bg-rose-500/10 active:text-rose-400"><Trash2 className="h-4 w-4"/></button></div>
      </div>)}</div>}
  </div>}
