import { useState } from 'react'
import { Bus, Check, Clock, MapPin, Phone, AlertTriangle, Undo2, Send, X, Bell, Navigation } from 'lucide-react'
import { useMinhaRota, useAvisos, confirmarPresenca, cancelarPresenca, solicitarVolta } from '@/hooks/useEstudante'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

export function MinhaRota(){
  const {rota:data,loading,refresh}=useMinhaRota()
  const avisos=useAvisos(data?.rota?.id||null)
  const [busy,setBusy]=useState<string|null>(null)
  const [showCanc,setShowCanc]=useState<'ida'|'volta'|null>(null)
  const [cancMotivo,setCancMotivo]=useState('')
  const [showSolVolta,setShowSolVolta]=useState(false)
  const [justificativa,setJustificativa]=useState('')

  if(loading)return <div className="flex flex-1 items-center justify-center pt-20"><Spinner className="h-8 w-8"/></div>
  if(!data)return <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center"><Bus className="h-16 w-16 text-white/10 mb-4"/><p className="text-lg font-semibold">Sem rota atribuida</p><p className="mt-1 text-sm text-white/40">Aguarde a distribuicao automatica ou entre em contato com o setor de transporte.</p></div>

  const {estudante:est,alocacao:aloc,rota,presenca_hoje:pres,solicitacao_volta:solVolta}=data
  const sit=rota?.situacao_operacional

  const doConfirmar=async(trecho:'ida'|'volta')=>{setBusy(trecho);try{await confirmarPresenca(trecho);toast('Presenca confirmada!');await refresh()}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}
  const doCancelar=async()=>{if(!showCanc||!cancMotivo.trim())return;setBusy('canc');try{await cancelarPresenca(showCanc,cancMotivo.trim());toast('Presenca cancelada');setShowCanc(null);setCancMotivo('');await refresh()}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}
  const doSolVolta=async()=>{if(!justificativa.trim())return;setBusy('sol');try{await solicitarVolta(justificativa.trim());toast('Solicitacao enviada!');setShowSolVolta(false);setJustificativa('');await refresh()}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}

  const fmtHora=(h:string|null)=>h?h.slice(0,5):''

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {/* Status documental */}
    {est.status_documental!=='aprovado'&&<div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5"/>
      <div><p className="text-sm font-semibold text-amber-400">Documentacao {est.status_documental==='pendente'?'em analise':'com pendencias'}</p>
        <p className="text-xs text-white/50 mt-1">Sua alocacao depende da aprovacao dos documentos obrigatorios.</p></div>
    </div>}

    {/* Card da rota */}
    {rota?<div className="card space-y-3 anim-in">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-semibold text-brand-500 tracking-wider">{rota.codigo}</p><h2 className="text-lg font-bold">{rota.nome}</h2></div>
        <span className={`chip ${sit==='em_rota'?'bg-emerald-500/20 text-emerald-400':sit==='concluida'?'bg-blue-500/20 text-blue-400':'bg-amber-500/20 text-amber-400'}`}>{sit==='em_rota'?'Em rota':sit==='concluida'?'Concluida':'Aguardando'}</span></div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 text-white/50"><MapPin className="h-4 w-4 text-brand-500/60"/><span className="truncate">{rota.origem} \u2192 {rota.destino}</span></div>
        <div className="flex items-center gap-2 text-white/50"><Clock className="h-4 w-4 text-brand-500/60"/><span>{fmtHora(rota.horario_partida)} / {fmtHora(rota.horario_retorno)}</span></div>
        {rota.motorista&&<div className="flex items-center gap-2 text-white/50"><Navigation className="h-4 w-4 text-brand-500/60"/><span className="truncate">{rota.motorista}</span></div>}
        {rota.motorista_telefone&&<div className="flex items-center gap-2 text-white/50"><Phone className="h-4 w-4 text-brand-500/60"/><a href={`tel:${rota.motorista_telefone}`} className="text-brand-500 underline">{rota.motorista_telefone}</a></div>}
        {rota.veiculo&&<div className="flex items-center gap-2 text-white/50"><Bus className="h-4 w-4 text-brand-500/60"/><span>{rota.veiculo} ({rota.veiculo_modelo})</span></div>}
      </div>
    </div>:<div className="card text-center py-8"><Bus className="h-12 w-12 text-white/10 mx-auto mb-3"/><p className="text-sm text-white/40">{aloc?.situacao==='fila_espera'?'Voce esta na fila de espera. Aguarde uma vaga.':'Aguardando alocacao em uma rota.'}</p></div>}

    {/* Presenca */}
    {rota&&<div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/60">Presenca de hoje</h3>
      <div className="flex gap-3">
        {/* IDA */}
        <div className="flex-1">{pres?.confirmou_ida?(
          <div className="card border-emerald-500/20 text-center">
            <Check className="h-6 w-6 text-emerald-400 mx-auto"/><p className="text-xs font-semibold text-emerald-400 mt-1">Ida confirmada</p><p className="text-[10px] text-white/30">{fmtHora(pres.hora_ida)}</p>
            <button onClick={()=>setShowCanc('ida')} className="mt-2 text-[10px] text-white/30 underline">Cancelar</button>
          </div>
        ):(
          <button onClick={()=>doConfirmar('ida')} disabled={!!busy} className="btn-success w-full flex items-center justify-center gap-2">
            {busy==='ida'?<Spinner/>:<><Check className="h-4 w-4"/>Confirmar Ida</>}
          </button>
        )}</div>
        {/* VOLTA */}
        <div className="flex-1">{pres?.confirmou_volta?(
          <div className="card border-blue-500/20 text-center">
            <Check className="h-6 w-6 text-blue-400 mx-auto"/><p className="text-xs font-semibold text-blue-400 mt-1">Volta confirmada</p><p className="text-[10px] text-white/30">{fmtHora(pres.hora_volta)}</p>
            <button onClick={()=>setShowCanc('volta')} className="mt-2 text-[10px] text-white/30 underline">Cancelar</button>
          </div>
        ):!pres?.confirmou_ida?(
          <button onClick={()=>setShowSolVolta(true)} disabled={!!busy} className="btn-outline w-full text-xs">Solicitar so a volta</button>
        ):(
          <button onClick={()=>doConfirmar('volta')} disabled={!!busy} className="btn-primary w-full flex items-center justify-center gap-2">
            {busy==='volta'?<Spinner/>:<><Check className="h-4 w-4"/>Confirmar Volta</>}
          </button>
        )}</div>
      </div>

      {/* Solicitacao de volta pendente */}
      {solVolta&&<div className={`card ${solVolta.status==='pendente'?'border-amber-500/20':solVolta.status==='aprovada'?'border-emerald-500/20':'border-rose-500/20'}`}>
        <p className="text-xs font-semibold">{solVolta.status==='pendente'?'\u23F3 Aguardando motorista':solVolta.status==='aprovada'?'\u2705 Volta aprovada':'\u274C Volta recusada'}</p>
        <p className="text-[10px] text-white/40 mt-1">"{solVolta.justificativa}"</p>
        {solVolta.motivo_recusa&&<p className="text-[10px] text-rose-400 mt-1">Motivo: {solVolta.motivo_recusa}</p>}
      </div>}
    </div>}

    {/* Avisos */}
    {avisos.length>0&&<><h3 className="text-sm font-semibold text-white/60 flex items-center gap-2"><Bell className="h-4 w-4"/>Avisos do motorista</h3>
      {avisos.map(a=><div key={a.id} className="card anim-in"><p className="text-sm">{a.mensagem}</p><p className="text-[10px] text-white/30 mt-1">{new Date(a.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p></div>)}</>}

    {/* Modal cancelar presenca */}
    {showCanc&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>{setShowCanc(null);setCancMotivo('')}}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Cancelar {showCanc}</h3><button onClick={()=>{setShowCanc(null);setCancMotivo('')}}><X className="h-5 w-5 text-white/40"/></button></div>
        <label className="block text-xs font-medium text-white/50 mb-1.5">Motivo (obrigatorio)</label>
        <textarea className="input-dark min-h-[80px] resize-none" value={cancMotivo} onChange={e=>setCancMotivo(e.target.value)} autoFocus placeholder="Descreva o motivo..."/>
        <button onClick={doCancelar} disabled={!cancMotivo.trim()||!!busy} className="btn-danger mt-4 flex items-center justify-center gap-2">{busy==='canc'?<Spinner/>:<><X className="h-4 w-4"/>Confirmar cancelamento</>}</button>
      </div></div>}

    {/* Modal solicitar volta */}
    {showSolVolta&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShowSolVolta(false)}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Solicitar so a volta</h3><button onClick={()=>setShowSolVolta(false)}><X className="h-5 w-5 text-white/40"/></button></div>
        <p className="text-xs text-white/40 mb-3">Explique por que voce nao embarcou na ida mas precisa da volta. O motorista decidira.</p>
        <textarea className="input-dark min-h-[100px] resize-none" value={justificativa} onChange={e=>setJustificativa(e.target.value)} autoFocus placeholder="Justificativa..."/>
        <button onClick={doSolVolta} disabled={!justificativa.trim()||!!busy} className="btn-primary mt-4 flex items-center justify-center gap-2">{busy==='sol'?<Spinner/>:<><Send className="h-4 w-4"/>Enviar solicitacao</>}</button>
      </div></div>}
  </div>}
