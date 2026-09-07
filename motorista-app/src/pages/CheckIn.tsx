import { useCallback, useMemo, useState } from 'react'
import { Bus, Check, ChevronDown, QrCode, RefreshCw, Search, Undo2, UserCheck, X } from 'lucide-react'
import { useRotas, usePassageiros, confirmarPresenca, cancelarPresenca, hoje, type Pax, type Trecho } from '@/hooks/useMotorista'
import { LeitorQR } from '@/components/LeitorQR'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

/** Remove acentos para que "jose" encontre "José". */
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

/**
 * O QR do aluno carrega o prontuario. Alguns geradores embutem o codigo numa
 * URL ou num prefixo, entao ficamos com a maior sequencia de digitos lida.
 */
function prontuarioDoQR(texto:string):string {
  const numeros=texto.match(/\d{4,}/g)
  return numeros ? numeros.sort((a,b)=>b.length-a.length)[0] : texto.trim()
}

export function CheckIn() {
  const {rotas,loading:lr}=useRotas()
  const [sel,setSel]=useState<string|null>(null)
  const rota=rotas.find(r=>r.rota_id===sel)||rotas[0]||null
  const {pax,loading:lp,refresh}=usePassageiros(rota?.rota_id||null)

  const [trecho,setTrecho]=useState<Trecho>('ida')
  const [busca,setBusca]=useState('')
  const [qr,setQr]=useState(false)
  const [ocupado,setOcupado]=useState<string|null>(null)
  const [desfazer,setDesfazer]=useState<{pax:Pax;trecho:Trecho}|null>(null)
  const [motivo,setMotivo]=useState('')

  const confirmou=useCallback((p:Pax)=>trecho==='ida'?p.confirmou_ida:p.confirmou_volta,[trecho])

  const checar=useCallback(async(p:Pax)=>{
    setOcupado(p.estudante_id)
    try{
      const r=await confirmarPresenca(p.estudante_id,trecho,hoje())
      toast(`${p.nome.split(' ')[0]}: ${r.mensagem}`)
      await refresh()
    }catch(e){ toast((e as Error).message,'err') }
    finally{ setOcupado(null) }
  },[trecho,refresh])

  const confirmarDesfazer=async()=>{
    if(!desfazer||!motivo.trim()) return
    setOcupado(desfazer.pax.estudante_id)
    try{
      const r=await cancelarPresenca(desfazer.pax.estudante_id,desfazer.trecho,motivo.trim(),hoje())
      toast(r.mensagem); await refresh(); setDesfazer(null); setMotivo('')
    }catch(e){ toast((e as Error).message,'err') }
    finally{ setOcupado(null) }
  }

  const lerQR=useCallback(async(texto:string)=>{
    setQr(false)
    const codigo=prontuarioDoQR(texto)
    const achado=pax.find(p=>p.prontuario===codigo)
    if(!achado){ toast(`Código ${codigo} não está nesta rota.`,'err'); return }
    if(confirmou(achado)){ toast(`${achado.nome.split(' ')[0]} já tinha check-in de ${trecho}.`); return }
    await checar(achado)
  },[pax,confirmou,trecho,checar])

  const filtrados=useMemo(()=>{
    const termo=normalizar(busca.trim())
    if(!termo) return pax
    return pax.filter(p=>normalizar(p.nome).includes(termo)||p.prontuario.includes(termo))
  },[pax,busca])

  // O codigo digitado bate exatamente com um aluno: oferece o check-in direto.
  const exato=useMemo(()=>{
    const t=busca.trim()
    return t.length>=4 ? pax.find(p=>p.prontuario===t)??null : null
  },[pax,busca])

  if(lr) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8"/></div>
  if(!rota) return <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
    <Bus className="mb-4 h-16 w-16 text-white/10"/>
    <p className="text-lg font-semibold">Nenhuma rota atribuída</p>
    <p className="mt-1 text-sm text-white/40">Peça ao administrador para vincular você a uma rota.</p>
  </div>

  const feitos=pax.filter(confirmou).length

  return <div className="px-4 pb-24 pt-4 space-y-4">
    {qr&&<LeitorQR onLer={lerQR} onFechar={()=>setQr(false)}/>}

    {rotas.length>1&&<div className="relative">
      <select aria-label="Rota" className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm font-medium text-white" value={sel||rota.rota_id} onChange={e=>setSel(e.target.value)}>
        {rotas.map(r=><option key={r.rota_id} value={r.rota_id}>{r.codigo} — {r.nome}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"/>
    </div>}

    <div className="flex items-baseline justify-between">
      <h2 className="text-lg font-bold">Check-in de passageiros</h2>
      <span className="text-xs text-white/40">{feitos}/{pax.length}</span>
    </div>

    {/* Trecho */}
    <div className="flex gap-2">
      <button onClick={()=>setTrecho('ida')} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${trecho==='ida'?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':'border border-white/10 text-white/40'}`}>Ida</button>
      <button onClick={()=>setTrecho('volta')} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${trecho==='volta'?'bg-blue-500/20 text-blue-400 border border-blue-500/30':'border border-white/10 text-white/40'}`}>Volta</button>
    </div>

    {/* Busca + QR */}
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"/>
        <input className="input-dark pl-10 pr-10" inputMode="text" placeholder="Código do aluno ou nome"
          value={busca} onChange={e=>setBusca(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&exato&&!confirmou(exato)){ checar(exato); setBusca('') } }}/>
        {busca&&<button onClick={()=>setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/30"><X className="h-4 w-4"/></button>}
      </div>
      <button onClick={()=>setQr(true)} aria-label="Ler QR code"
        className="flex w-14 flex-shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-gold-500 active:scale-95 transition-transform">
        <QrCode className="h-6 w-6"/>
      </button>
    </div>

    {exato&&!confirmou(exato)&&<button onClick={()=>{checar(exato);setBusca('')}} disabled={!!ocupado}
      className="btn-gold flex items-center justify-center gap-2">
      <UserCheck className="h-4 w-4"/>Check-in de {exato.nome.split(' ')[0]}
    </button>}

    <div className="flex items-center justify-between">
      <p className="text-xs text-white/40">Toque no aluno para registrar a {trecho}</p>
      <button onClick={refresh} aria-label="Atualizar lista" className="rounded-lg p-2 text-white/30 active:bg-white/5"><RefreshCw className={`h-4 w-4 ${lp?'animate-spin':''}`}/></button>
    </div>

    {lp&&pax.length===0?<div className="flex justify-center py-12"><Spinner/></div>:
     filtrados.length===0?<p className="py-10 text-center text-sm text-white/30">{busca?'Nenhum aluno encontrado com esse código ou nome.':'Nenhum passageiro nesta rota.'}</p>:
     <div className="space-y-2">{filtrados.map((p,i)=>{
      const ok=confirmou(p)
      const carregando=ocupado===p.estudante_id
      return <div key={p.alocacao_id} className={`card flex items-center gap-3 anim-in ${ok?'border-emerald-500/25':''}`} style={{animationDelay:`${Math.min(i,10)*30}ms`}}>
        <button onClick={()=>{ if(!ok&&!ocupado) checar(p) }} disabled={ok||!!ocupado}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${ok?'bg-emerald-500/20 text-emerald-400':'bg-gold-500/10 text-gold-500'}`}>
            {carregando?<Spinner className="h-4 w-4"/>:ok?<Check className="h-5 w-5"/>:p.nome.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.nome}</p>
            <p className="truncate text-xs text-white/40">{p.prontuario}{p.universidade||p.curso?` · ${p.universidade||p.curso}`:''}</p>
          </div>
        </button>
        {ok
          ? <button onClick={()=>setDesfazer({pax:p,trecho})} disabled={!!ocupado}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-[10px] font-semibold text-white/40 active:bg-rose-500/10 active:text-rose-400">
              <Undo2 className="h-3 w-3"/>Desfazer
            </button>
          : <span className="flex-shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-white/30">Pendente</span>}
      </div>
     })}</div>}

    {/* Check-out: o banco exige motivo para cancelar uma presenca */}
    {desfazer&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>{setDesfazer(null);setMotivo('')}}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-10 anim-in" onClick={e=>e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Desfazer check-in</h3>
          <button onClick={()=>{setDesfazer(null);setMotivo('')}} aria-label="Fechar"><X className="h-5 w-5 text-white/40"/></button>
        </div>
        <div className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-400">
          Cancelar a {desfazer.trecho} de <strong>{desfazer.pax.nome}</strong>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-white/50">Motivo (obrigatório)</label>
        <textarea className="input-dark min-h-[80px] resize-none" placeholder="Ex: aluno desembarcou antes da partida" value={motivo} onChange={e=>setMotivo(e.target.value)} autoFocus/>
        <button onClick={confirmarDesfazer} disabled={!motivo.trim()||!!ocupado} className="btn-red mt-4 flex items-center justify-center gap-2">
          {ocupado?<Spinner/>:<><X className="h-4 w-4"/>Confirmar</>}
        </button>
      </div>
    </div>}
  </div>
}
