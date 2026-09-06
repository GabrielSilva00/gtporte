import { useState } from 'react'; import { MessageCircle, Plus, Send, X } from 'lucide-react'
import { useMensagens } from '@/hooks/useMotorista'; import { Spinner } from '@/components/Spinner'; import { toast } from '@/components/Toast'
export function Mensagens(){
  const {msgs,loading,enviar,marcarLida}=useMensagens()
  const [show,setShow]=useState(false);const [assunto,setAssunto]=useState('');const [corpo,setCorpo]=useState('');const [busy,setBusy]=useState(false);const [aberta,setAberta]=useState<string|null>(null)
  const send=async()=>{if(!assunto.trim()||!corpo.trim())return;setBusy(true);try{await enviar(assunto.trim(),corpo.trim());setAssunto('');setCorpo('');setShow(false);toast('Mensagem enviada')}catch(e){toast((e as Error).message,'err')}finally{setBusy(false)}}
  const fmt=(d:string)=>new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Mensagens</h2>
      <button onClick={()=>setShow(true)} className="flex items-center gap-1.5 rounded-xl bg-gold-500 px-4 py-2.5 text-xs font-bold text-navy-900"><Plus className="h-4 w-4"/>Nova</button></div>
    {show&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShow(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Nova mensagem</h3><button onClick={()=>setShow(false)}><X className="h-5 w-5 text-white/40"/></button></div>
        <input className="input-dark mb-3" placeholder="Assunto" value={assunto} onChange={e=>setAssunto(e.target.value)} autoFocus/>
        <textarea className="input-dark min-h-[100px] resize-none" placeholder="Sua mensagem..." value={corpo} onChange={e=>setCorpo(e.target.value)}/>
        <button onClick={send} disabled={busy} className="btn-gold mt-4 flex items-center justify-center gap-2">{busy?<Spinner/>:<><Send className="h-4 w-4"/>Enviar</>}</button>
      </div></div>}
    {loading?<div className="flex justify-center py-12"><Spinner/></div>:msgs.length===0?
      <div className="flex flex-col items-center py-12 text-center"><MessageCircle className="h-12 w-12 text-white/10 mb-3"/><p className="text-sm text-white/40">Nenhuma mensagem</p></div>:
      <div className="space-y-2">{msgs.map((m,i)=><button key={m.id} onClick={()=>{setAberta(aberta===m.id?null:m.id);if(!m.lida)marcarLida(m.id)}}
        className={`card w-full text-left anim-in ${!m.lida?'border-gold-500/30':''}`} style={{animationDelay:`${i*30}ms`}}>
        <div className="flex items-center justify-between gap-2"><p className={`truncate text-sm ${!m.lida?'font-bold':'font-medium'}`}>{m.assunto}</p>
          {!m.lida&&<span className="h-2 w-2 flex-shrink-0 rounded-full bg-gold-500"/>}</div>
        <p className="mt-0.5 text-[10px] text-white/30">{m.remetente?.nome||'Você'} · {fmt(m.criado_em)}</p>
        {aberta===m.id&&<p className="mt-3 rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-white/70">{m.corpo}</p>}
      </button>)}</div>}
  </div>}
