import { useEffect, useRef, useState } from 'react'
import { CameraOff, X } from 'lucide-react'
import jsQR from 'jsqr'
import { Spinner } from '@/components/Spinner'

/**
 * Leitor de QR sobre a camera traseira do celular. O quadro do video e
 * copiado para um canvas e decodificado pelo jsQR a cada frame.
 *
 * A camera so e liberada pelo navegador em contexto seguro: https, ou
 * localhost no desenvolvimento. Em http num IP da rede o getUserMedia
 * falha, e a mensagem de erro abaixo explica isso ao motorista.
 */
export function LeitorQR({onLer,onFechar}:{onLer:(texto:string)=>void;onFechar:()=>void}) {
  const videoRef=useRef<HTMLVideoElement>(null)
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const [erro,setErro]=useState('')
  const [pronto,setPronto]=useState(false)

  useEffect(()=>{
    let stream:MediaStream|null=null
    let frame=0
    let parado=false

    const varrer=()=>{
      if(parado) return
      const video=videoRef.current, canvas=canvasRef.current
      if(video&&canvas&&video.readyState===video.HAVE_ENOUGH_DATA){
        const ctx=canvas.getContext('2d',{willReadFrequently:true})
        if(ctx){
          canvas.width=video.videoWidth; canvas.height=video.videoHeight
          ctx.drawImage(video,0,0,canvas.width,canvas.height)
          const img=ctx.getImageData(0,0,canvas.width,canvas.height)
          const achou=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'})
          if(achou?.data){ parado=true; onLer(achou.data.trim()); return }
        }
      }
      frame=requestAnimationFrame(varrer)
    }

    ;(async()=>{
      if(!navigator.mediaDevices?.getUserMedia){
        setErro('Este navegador não dá acesso à câmera. Use o código do aluno no campo de busca.')
        return
      }
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}})
        if(parado){ stream.getTracks().forEach(t=>t.stop()); return }
        if(videoRef.current){
          videoRef.current.srcObject=stream
          await videoRef.current.play()
          setPronto(true)
          frame=requestAnimationFrame(varrer)
        }
      }catch(e){
        const nome=(e as DOMException)?.name
        if(nome==='NotAllowedError') setErro('Permissão de câmera negada. Autorize o acesso nas configurações do navegador.')
        else if(nome==='NotFoundError') setErro('Nenhuma câmera encontrada neste aparelho.')
        else setErro('Não foi possível abrir a câmera. Em conexão sem https o navegador bloqueia o acesso.')
      }
    })()

    return ()=>{ parado=true; cancelAnimationFrame(frame); stream?.getTracks().forEach(t=>t.stop()) }
  },[onLer])

  return <div className="fixed inset-0 z-50 flex flex-col bg-black">
    <div className="flex items-center justify-between px-4 py-3 text-white">
      <p className="text-sm font-semibold">Aponte para o QR do aluno</p>
      <button onClick={onFechar} aria-label="Fechar leitor" className="rounded-lg p-2 active:bg-white/10"><X className="h-5 w-5"/></button>
    </div>

    <div className="relative flex-1 overflow-hidden">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover"/>
      <canvas ref={canvasRef} className="hidden"/>

      {!erro&&!pronto&&<div className="absolute inset-0 flex items-center justify-center"><Spinner className="h-8 w-8"/></div>}

      {/* Moldura de mira */}
      {pronto&&<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-56 w-56 rounded-3xl border-2 border-gold-500/80 shadow-[0_0_0_100vmax_rgba(0,0,0,.55)]"/>
      </div>}

      {erro&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <CameraOff className="h-10 w-10 text-white/30"/>
        <p className="text-sm text-white/60">{erro}</p>
        <button onClick={onFechar} className="btn-outline mt-2 max-w-xs">Voltar</button>
      </div>}
    </div>

    {pronto&&<p className="px-8 pb-8 pt-4 text-center text-xs text-white/40">O check-in é feito assim que o código for reconhecido.</p>}
  </div>
}
