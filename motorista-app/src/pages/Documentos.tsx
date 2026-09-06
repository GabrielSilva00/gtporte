import { useState, useRef } from 'react'
import { FileText, Upload, Plus, X, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { useDocumentos, ROTULO_DOC, type TipoDocMot } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const TIPOS = Object.keys(ROTULO_DOC) as TipoDocMot[]
const COR_STATUS: Record<string,{icon:typeof CheckCircle;cls:string;label:string}> = {
  aprovado:{icon:CheckCircle,cls:'text-emerald-400',label:'Aprovado'},
  pendente:{icon:Clock,cls:'text-amber-400',label:'Em análise'},
  rejeitado:{icon:XCircle,cls:'text-rose-400',label:'Rejeitado'},
}

export function Documentos() {
  const {docs,loading,upload}=useDocumentos()
  const [show,setShow]=useState(false)
  const [tipo,setTipo]=useState<TipoDocMot>('cnh_frente')
  const [validade,setValidade]=useState('')
  const [arquivo,setArquivo]=useState<File|null>(null)
  const [busy,setBusy]=useState(false)
  const inputRef=useRef<HTMLInputElement>(null)

  const enviar=async()=>{
    if(!arquivo) return
    setBusy(true)
    try{await upload(tipo,arquivo,validade||undefined);toast('Documento enviado');setShow(false);setArquivo(null);setValidade('')}
    catch(e){toast((e as Error).message,'err')}
    finally{setBusy(false)}
  }

  const obrigatorios:TipoDocMot[]=['cnh_frente','cnh_verso','toxicologico','aso']
  const faltando=obrigatorios.filter(t=>!docs.some(d=>d.tipo===t&&d.status!=='rejeitado'))

  const fmt=(d:string)=>{const dt=new Date(d);return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})}

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-bold">Meus Documentos</h2>
      <button onClick={()=>setShow(true)} className="flex items-center gap-1.5 rounded-xl bg-gold-500 px-4 py-2.5 text-xs font-bold text-navy-900"><Plus className="h-4 w-4"/>Enviar</button>
    </div>

    {faltando.length>0&&<div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
      <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-1"><AlertTriangle className="h-4 w-4"/>Documentos pendentes</div>
      <p className="text-xs text-white/50">{faltando.map(t=>ROTULO_DOC[t]).join(', ')}</p>
    </div>}

    {loading?<div className="flex justify-center py-12"><Spinner/></div>:docs.length===0?
      <div className="flex flex-col items-center py-12 text-center"><FileText className="h-12 w-12 text-white/10 mb-3"/><p className="text-sm text-white/40">Nenhum documento enviado</p><p className="text-xs text-white/25 mt-1">Envie seus documentos para análise do setor.</p></div>:
      <div className="space-y-2">{docs.map((d,i)=>{const st=COR_STATUS[d.status]||COR_STATUS.pendente;const StIcon=st.icon;return (
        <div key={d.id} className="card anim-in" style={{animationDelay:`${i*30}ms`}}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-500"><FileText className="h-5 w-5"/></div>
              <div><p className="text-sm font-semibold">{ROTULO_DOC[d.tipo]}</p>
                <p className="text-[10px] text-white/30">{d.nome_arquivo} · {fmt(d.criado_em)}</p>
                {d.validade&&<p className="text-[10px] text-white/30">Validade: {fmt(d.validade)}</p>}
              </div>
            </div>
            <div className={`flex items-center gap-1 ${st.cls}`}><StIcon className="h-4 w-4"/><span className="text-[10px] font-semibold">{st.label}</span></div>
          </div>
          {d.status==='rejeitado'&&d.observacao&&<div className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-400">{d.observacao}</div>}
        </div>
      )})}</div>}

    {/* Modal upload */}
    {show&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShow(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Enviar documento</h3><button onClick={()=>setShow(false)}><X className="h-5 w-5 text-white/40"/></button></div>
        <div className="space-y-4">
          <div><label className="block text-xs font-medium text-white/50 mb-1.5">Tipo de documento</label>
            <select className="input-dark" value={tipo} onChange={e=>setTipo(e.target.value as TipoDocMot)}>
              {TIPOS.map(t=><option key={t} value={t}>{ROTULO_DOC[t]}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-white/50 mb-1.5">Validade (opcional)</label>
            <input className="input-dark" type="date" value={validade} onChange={e=>setValidade(e.target.value)}/></div>
          <div>
            <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e=>setArquivo(e.target.files?.[0]||null)}/>
            <button onClick={()=>inputRef.current?.click()} className={`btn-outline flex items-center justify-center gap-2 ${arquivo?'border-gold-500/30 text-gold-500':''}`}>
              <Upload className="h-4 w-4"/>{arquivo?arquivo.name:'Selecionar arquivo'}
            </button>
          </div>
          <button onClick={enviar} disabled={busy||!arquivo} className="btn-gold flex items-center justify-center gap-2">
            {busy?<Spinner/>:<><Upload className="h-4 w-4"/>Enviar documento</>}
          </button>
        </div>
      </div>
    </div>}
  </div>
}
