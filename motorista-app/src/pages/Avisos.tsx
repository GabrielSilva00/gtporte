import { useState } from 'react'
import { Bell, ChevronDown, Plus, Send, Trash2, X } from 'lucide-react'
import { useRotas, useAvisos } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

export function Avisos(){
  const {rotas,loading:lr}=useRotas()
  const [sel,setSel]=useState<string|null>(null)
  // Antes a tela usava sempre rotas[0]: quem dirige mais de uma rota publicava
  // o aviso na errada, sem perceber.
  const rota=rotas.find(r=>r.rota_id===sel)||rotas[0]||null
  const {avisos,loading,enviar,excluir}=useAvisos(rota?.rota_id||null)
  const [show,setShow]=useState(false)
  const [msg,setMsg]=useState('')
  const [busy,setBusy]=useState(false)

  if(lr) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8"/></div>
  if(!rota) return <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
    <Bell className="mb-4 h-16 w-16 text-white/10"/>
    <p className="text-lg font-semibold">Nenhuma rota atribuída</p>
    <p className="mt-1 text-sm text-white/40">Sem rota não há a quem avisar.</p>
  </div>

  const enviarAviso=async()=>{
    if(!msg.trim())return
    setBusy(true)
    try{ await enviar(msg.trim()); setMsg(''); setShow(false); toast('Aviso enviado') }
    catch(e){ toast((e as Error).message,'err') }
    finally{ setBusy(false) }
  }

  const remover=async(id:string)=>{
    try{ await excluir(id); toast('Aviso removido') }
    catch(e){ toast((e as Error).message,'err') }
  }

  const fmt=(d:string)=>{
    const dt=new Date(d)
    return `${dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} às ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`
  }

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {rotas.length>1&&<div className="relative">
      <select aria-label="Rota" className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm font-medium text-white" value={sel||rota.rota_id} onChange={e=>setSel(e.target.value)}>
        {rotas.map(r=><option key={r.rota_id} value={r.rota_id}>{r.codigo} — {r.nome}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"/>
    </div>}

    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Avisos da rota</h2>
      <button onClick={()=>setShow(true)} className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gold-500 px-4 py-2.5 text-xs font-bold text-navy-900">
        <Plus className="h-4 w-4"/>Novo
      </button>
    </div>
    <p className="text-xs text-white/40">Rota {rota.codigo} · os passageiros veem esses avisos</p>

    {show&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShow(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Novo aviso</h3>
          <button onClick={()=>setShow(false)} aria-label="Fechar"><X className="h-5 w-5 text-white/40"/></button>
        </div>
        <textarea className="input-dark min-h-[120px] resize-none" placeholder="Ex: o ônibus sairá 15 min mais cedo amanhã" value={msg} onChange={e=>setMsg(e.target.value)} autoFocus/>
        <button onClick={enviarAviso} disabled={busy||!msg.trim()} className="btn-gold mt-4 flex items-center justify-center gap-2">
          {busy?<Spinner/>:<><Send className="h-4 w-4"/>Enviar aviso</>}
        </button>
      </div>
    </div>}

    {loading?<div className="flex justify-center py-12"><Spinner/></div>:
     avisos.length===0?
      <div className="flex flex-col items-center py-12 text-center">
        <Bell className="mb-3 h-12 w-12 text-white/10"/>
        <p className="text-sm text-white/40">Nenhum aviso publicado</p>
      </div>:
      <div className="space-y-3">{avisos.map((a,i)=>
        <div key={a.id} className="card anim-in" style={{animationDelay:`${Math.min(i,10)*40}ms`}}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm leading-relaxed">{a.mensagem}</p>
              <p className="mt-2 text-[10px] text-white/30">{fmt(a.criado_em)}</p>
            </div>
            <button onClick={()=>remover(a.id)} aria-label="Remover aviso" className="flex-shrink-0 rounded-lg p-2 text-white/20 active:bg-rose-500/10 active:text-rose-400">
              <Trash2 className="h-4 w-4"/>
            </button>
          </div>
        </div>)}
      </div>}
  </div>
}
