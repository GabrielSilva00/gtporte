import { useState } from 'react'
import { Bus, Check, Clock, MapPin, Phone, AlertTriangle, Send, X, Bell, Navigation, QrCode } from 'lucide-react'
import { useMinhaRota, useAvisos, confirmarPresenca, cancelarPresenca, solicitarVolta } from '@/hooks/useEstudante'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'
import { ModalQr } from '@/components/QrEmbarque'
import { CancelarPresenca } from '@/components/CancelarPresenca'
import { MapaRota } from '@/components/MapaRota'

export function MinhaRota(){
  const {rota:data,loading,refresh}=useMinhaRota()
  const avisos=useAvisos(data?.rota?.id||null)
  const [busy,setBusy]=useState<string|null>(null)
  const [showCanc,setShowCanc]=useState<'ida'|'volta'|null>(null)
  const [showSolVolta,setShowSolVolta]=useState(false)
  const [justificativa,setJustificativa]=useState('')
  const [qr,setQr]=useState<'ida'|'volta'|null>(null)

  if(loading)return <div className="flex flex-1 items-center justify-center pt-20"><Spinner className="h-8 w-8"/></div>
  if(!data)return <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center"><Bus className="h-16 w-16 text-faint/40 mb-4"/><p className="text-lg font-semibold">Sem rota atribuida</p><p className="mt-1 text-sm text-muted">Aguarde a distribuicao automatica ou entre em contato com o setor de transporte.</p></div>

  const {estudante:est,alocacao:aloc,rota,presenca_hoje:pres,solicitacao_volta:solVolta}=data
  const sit=rota?.situacao_operacional

  const doConfirmar=async(trecho:'ida'|'volta')=>{setBusy(trecho);try{await confirmarPresenca(trecho);toast('Presenca confirmada!');await refresh();if(est.prontuario)setQr(trecho)}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}
  const doCancelar=async(dados:{motivo:string;texto:string;rotaDestinoId?:string})=>{
    if(!showCanc)return
    setBusy('canc')
    try{
      await cancelarPresenca(showCanc,dados.texto,dados.motivo,dados.rotaDestinoId)
      toast(dados.rotaDestinoId
        ? 'Solicitação enviada ao motorista da outra rota.'
        : 'Presença cancelada.')
      setShowCanc(null)
      await refresh()
    }catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}
  }
  const doSolVolta=async()=>{if(!justificativa.trim())return;setBusy('sol');try{await solicitarVolta(justificativa.trim());toast('Solicitacao enviada!');setShowSolVolta(false);setJustificativa('');await refresh()}catch(e){toast((e as Error).message,'err')}finally{setBusy(null)}}

  const fmtHora=(h:string|null)=>h?h.slice(0,5):''

  return <div className="px-4 pb-24 pt-16 space-y-4">
    {/* Status documental */}
    {est.status_documental!=='aprovado'&&<div className="rounded-2xl bg-warn/10 border border-warn/20 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-warn flex-shrink-0 mt-0.5"/>
      <div><p className="text-sm font-semibold text-warn">Documentacao {est.status_documental==='pendente'?'em analise':'com pendencias'}</p>
        <p className="text-xs text-muted mt-1">Sua alocacao depende da aprovacao dos documentos obrigatorios.</p></div>
    </div>}

    {/* Card da rota */}
    {rota?<div className="card space-y-3 anim-in">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-semibold text-brand-500 tracking-wider">{rota.codigo}</p><h2 className="text-lg font-bold">{rota.nome}</h2></div>
        <span className={`chip ${sit==='em_rota'?'bg-ok/10 text-ok':sit==='concluida'?'bg-info/10 text-info':'bg-warn/10 text-warn'}`}>{sit==='em_rota'?'Em rota':sit==='concluida'?'Concluida':'Aguardando'}</span></div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 text-muted"><MapPin className="h-4 w-4 text-brand-500/60"/><span className="truncate">{rota.origem} \u2192 {rota.destino}</span></div>
        <div className="flex items-center gap-2 text-muted"><Clock className="h-4 w-4 text-brand-500/60"/><span>{fmtHora(rota.horario_partida)} / {fmtHora(rota.horario_retorno)}</span></div>
        {rota.motorista&&<div className="flex items-center gap-2 text-muted"><Navigation className="h-4 w-4 text-brand-500/60"/><span className="truncate">{rota.motorista}</span></div>}
        {rota.motorista_telefone&&<div className="flex items-center gap-2 text-muted"><Phone className="h-4 w-4 text-brand-500/60"/><a href={`tel:${rota.motorista_telefone}`} className="text-brand-500 underline">{rota.motorista_telefone}</a></div>}
        {rota.veiculo&&<div className="flex items-center gap-2 text-muted"><Bus className="h-4 w-4 text-brand-500/60"/><span>{rota.veiculo} ({rota.veiculo_modelo})</span></div>}
      </div>
    </div>:<div className="card text-center py-8"><Bus className="h-12 w-12 text-faint/40 mx-auto mb-3"/><p className="text-sm text-muted">{aloc?.situacao==='fila_espera'?'Voce esta na fila de espera. Aguarde uma vaga.':'Aguardando alocacao em uma rota.'}</p></div>}

    {/* Mapa do trajeto: paradas e, em viagem, a posicao do onibus */}
    {rota&&<div className="card space-y-2 anim-in">
      <h3 className="text-sm font-semibold">Trajeto</h3>
      <MapaRota rotaId={rota.id} emRota={sit==='em_rota'}/>
    </div>}

    {/* Presenca */}
    {rota&&<div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted">Presenca de hoje</h3>
      <div className="flex gap-3">
        {/* IDA */}
        <div className="flex-1">{pres?.confirmou_ida?(
          <div className="card border-ok/30 text-center">
            <Check className="h-6 w-6 text-ok mx-auto"/><p className="text-xs font-semibold text-ok mt-1">Ida confirmada</p><p className="text-[11px] text-faint">{fmtHora(pres.hora_ida)}</p>
            <button onClick={()=>est.prontuario&&setQr('ida')} className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-brand-500"><QrCode className="h-3 w-3"/>Ver código</button>
            <button onClick={()=>setShowCanc('ida')} className="mt-1 text-[11px] text-muted underline">Cancelar</button>
          </div>
        ):(
          <button onClick={()=>doConfirmar('ida')} disabled={!!busy} className="btn-success w-full flex items-center justify-center gap-2">
            {busy==='ida'?<Spinner/>:<><Check className="h-4 w-4"/>Confirmar Ida</>}
          </button>
        )}</div>
        {/* VOLTA */}
        <div className="flex-1">{pres?.confirmou_volta?(
          <div className="card border-info/30 text-center">
            <Check className="h-6 w-6 text-info mx-auto"/><p className="text-xs font-semibold text-info mt-1">Volta confirmada</p><p className="text-[11px] text-faint">{fmtHora(pres.hora_volta)}</p>
            <button onClick={()=>est.prontuario&&setQr('volta')} className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-brand-500"><QrCode className="h-3 w-3"/>Ver código</button>
            <button onClick={()=>setShowCanc('volta')} className="mt-1 text-[11px] text-muted underline">Cancelar</button>
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
      {solVolta&&<div className={`card ${solVolta.status==='pendente'?'border-warn/20':solVolta.status==='aprovada'?'border-ok/30':'border-err/30'}`}>
        <p className="text-xs font-semibold">{solVolta.status==='pendente'?'\u23F3 Aguardando motorista':solVolta.status==='aprovada'?'\u2705 Volta aprovada':'\u274C Volta recusada'}</p>
        <p className="text-[11px] text-muted mt-1">"{solVolta.justificativa}"</p>
        {solVolta.motivo_recusa&&<p className="text-[11px] text-err mt-1">Motivo: {solVolta.motivo_recusa}</p>}
      </div>}
    </div>}

    {/* Avisos */}
    {avisos.length>0&&<><h3 className="text-sm font-semibold text-muted flex items-center gap-2"><Bell className="h-4 w-4"/>Avisos do motorista</h3>
      {avisos.map(a=><div key={a.id} className="card anim-in"><p className="text-sm">{a.mensagem}</p><p className="text-[11px] text-faint mt-1">{new Date(a.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p></div>)}</>}

    {showCanc&&<CancelarPresenca trecho={showCanc} ocupado={busy==='canc'} onConfirmar={doCancelar} onFechar={()=>setShowCanc(null)}/>}

    {/* Modal solicitar volta */}
    {showSolVolta&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShowSolVolta(false)}>
      <div className="anim-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Solicitar so a volta</h3><button onClick={()=>setShowSolVolta(false)}><X className="h-5 w-5 text-muted"/></button></div>
        <p className="text-xs text-muted mb-3">Explique por que voce nao embarcou na ida mas precisa da volta. O motorista decidira.</p>
        <textarea className="field min-h-[100px] resize-none" value={justificativa} onChange={e=>setJustificativa(e.target.value)} autoFocus placeholder="Justificativa..."/>
        <button onClick={doSolVolta} disabled={!justificativa.trim()||!!busy} className="btn-primary mt-4 flex items-center justify-center gap-2">{busy==='sol'?<Spinner/>:<><Send className="h-4 w-4"/>Enviar solicitacao</>}</button>
      </div></div>}
  
    {qr&&est.prontuario&&<ModalQr prontuario={est.prontuario} trecho={qr} onFechar={()=>setQr(null)}/>}
  </div>}