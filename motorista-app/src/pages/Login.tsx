import { useState } from 'react'; import { Bus, Eye, EyeOff, LogIn } from 'lucide-react'; import { Spinner } from '@/components/Spinner'
export function Login({onLogin}:{onLogin:(id:string,pw:string)=>Promise<void>}){
  const [id,setId]=useState('');const [pw,setPw]=useState('');const [show,setShow]=useState(false);const [err,setErr]=useState('');const [busy,setBusy]=useState(false)
  const go=async()=>{if(!id.trim()||!pw)return;setErr('');setBusy(true);try{await onLogin(id.trim(),pw)}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
  return <div className="flex min-h-screen flex-col items-center justify-center px-6">
    <div className="mb-8 flex flex-col items-center gap-3 anim-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gold-500/10"><Bus className="h-10 w-10 text-gold-500"/></div>
      <h1 className="text-2xl font-bold">GTPORTE</h1><p className="text-sm text-white/50">App do Motorista</p></div>
    <div className="w-full max-w-sm space-y-4 anim-in" style={{animationDelay:'.15s'}}>
      <div><label className="mb-1.5 block text-xs font-medium text-white/50">Login ou e-mail</label>
        <input className="input-dark" placeholder="Seu login" value={id} onChange={e=>setId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()} autoCapitalize="off" autoCorrect="off"/></div>
      <div><label className="mb-1.5 block text-xs font-medium text-white/50">Senha</label>
        <div className="relative"><input className="input-dark pr-12" type={show?'text':'password'} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/>
          <button onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">{show?<EyeOff className="h-5 w-5"/>:<Eye className="h-5 w-5"/>}</button></div></div>
      {err&&<p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{err}</p>}
      <button onClick={go} disabled={busy} className="btn-gold flex items-center justify-center gap-2">{busy?<Spinner/>:<><LogIn className="h-4 w-4"/>Entrar</>}</button>
    </div>
    <p className="mt-10 text-[10px] text-white/20">Transporte Acadêmico Municipal</p>
  </div>}
