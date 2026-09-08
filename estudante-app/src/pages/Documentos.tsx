import { useState, useRef } from 'react'
import { FileText, Upload, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { useDocumentos, ROTULO_DOC, TIPOS_DOC, type TipoDoc } from '@/hooks/useEstudante'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const COR:Record<string,{icon:typeof CheckCircle;cls:string;label:string}>={aprovado:{icon:CheckCircle,cls:'text-emerald-400',label:'Aprovado'},pendente:{icon:Clock,cls:'text-amber-400',label:'Em analise'},rejeitado:{icon:XCircle,cls:'text-rose-400',label:'Rejeitado'}}

export function Documentos({estudanteId}:{estudanteId:string}){
  const {docs,loading,enviar}=useDocumentos(estudanteId)
  const [busy,setBusy]=useState<TipoDoc|null>(null)
  const refs=useRef<Record<string,HTMLInputElement|null>>({})

  const porTipo=new Map(docs.map(d=>[d.tipo,d]))
  const faltando=TIPOS_DOC.filter(t=>!docs.some(d=>d.tipo===t&&d.status!=='rejeitado'))

  const doEnviar=async(tipo:TipoDoc,arquivo:File)=>{setBusy(tipo);try{await enviar(tipo,arquivo);toast('Documento enviado!')}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}

  if(loading)return <div className="flex justify-center py-12"><Spinner/></div>

  return <div className="px-4 pb-24 pt-4 space-y-4">
    <h2 className="text-lg font-bold">Meus Documentos</h2>
    {faltando.length>0&&<div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3"><div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-1"><AlertTriangle className="h-4 w-4"/>Documentos pendentes</div>
      <p className="text-xs text-white/50">{faltando.map(t=>ROTULO_DOC[t]).join(', ')}</p></div>}

    <div className="space-y-2">{TIPOS_DOC.map((tipo,i)=>{
      const doc=porTipo.get(tipo);const st=doc?COR[doc.status]:null;const StIcon=st?.icon||FileText
      const podeEnviar=!doc||doc.status==='rejeitado'||doc.status==='pendente'
      return <div key={tipo} className="card anim-in" style={{animationDelay:`${i*40}ms`}}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${doc?'bg-brand-500/10 text-brand-500':'bg-white/5 text-white/20'}`}><FileText className="h-5 w-5"/></div>
            <div><p className="text-sm font-semibold">{ROTULO_DOC[tipo]}</p>
              {doc?<p className="text-[10px] text-white/30">{doc.nome_arquivo}</p>:<p className="text-[10px] text-white/25">Nao enviado</p>}
            </div></div>
          {st&&<div className={`flex items-center gap-1 ${st.cls}`}><StIcon className="h-4 w-4"/><span className="text-[10px] font-semibold">{st.label}</span></div>}
        </div>
        {doc?.status==='rejeitado'&&doc.observacao&&<div className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-400">{doc.observacao}</div>}
        {podeEnviar&&<div className="mt-3">
          <input ref={el=>{refs.current[tipo]=el}} type="file" accept="image/*,.pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)doEnviar(tipo,f)}}/>
          <button onClick={()=>refs.current[tipo]?.click()} disabled={!!busy} className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${doc?'bg-white/5 text-white/50':'bg-brand-600/20 text-brand-500'}`}>
            {busy===tipo?<Spinner className="h-4 w-4"/>:<><Upload className="h-4 w-4"/>{doc?'Reenviar':'Enviar'}</>}
          </button></div>}
      </div>})}</div>
  </div>}
