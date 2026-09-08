import { useState } from 'react'
import { GraduationCap, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

export function Login({onLogin,onCadastrar}:{onLogin:(e:string,p:string)=>Promise<void>;onCadastrar:(n:string,e:string,t:string,p:string)=>Promise<any>}){
  const [tab,setTab]=useState<'login'|'cadastro'>('login')
  const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [show,setShow]=useState(false)
  const [nome,setNome]=useState('');const [tel,setTel]=useState('');const [pw2,setPw2]=useState('')
  const [err,setErr]=useState('');const [busy,setBusy]=useState(false)

  const goLogin=async()=>{if(!email||!pw)return;setErr('');setBusy(true);try{await onLogin(email.trim(),pw)}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
  const goCadastro=async()=>{if(!nome||!email||!pw||pw!==pw2)return;setErr('');setBusy(true);try{await onCadastrar(nome,email,tel,pw)}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}

  return <div className="flex min-h-screen flex-col items-center justify-center px-6">
    <div className="mb-8 flex flex-col items-center gap-3 anim-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10"><GraduationCap className="h-10 w-10 text-brand-500"/></div>
      <h1 className="text-2xl font-bold">GTPORTE</h1><p className="text-sm text-white/50">Portal do Estudante</p></div>

    <div className="w-full max-w-sm anim-in" style={{animationDelay:'.15s'}}>
      <div className="flex mb-6 rounded-xl bg-white/5 p-1">
        <button onClick={()=>{setTab('login');setErr('')}} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${tab==='login'?'bg-brand-600 text-white':'text-white/40'}`}>Entrar</button>
        <button onClick={()=>{setTab('cadastro');setErr('')}} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${tab==='cadastro'?'bg-brand-600 text-white':'text-white/40'}`}>Cadastrar</button>
      </div>

      {tab==='login'?(
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">E-mail</label>
            <input className="input-dark" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&goLogin()} placeholder="seu@email.com"/></div>
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">Senha</label>
            <div className="relative"><input className="input-dark pr-12" type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&goLogin()} placeholder="Sua senha"/>
              <button onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">{show?<EyeOff className="h-5 w-5"/>:<Eye className="h-5 w-5"/>}</button></div></div>
          {err&&<p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{err}</p>}
          <button onClick={goLogin} disabled={busy} className="btn-primary flex items-center justify-center gap-2">{busy?<Spinner/>:<><LogIn className="h-4 w-4"/>Entrar</>}</button>
        </div>
      ):(
        <div className="space-y-3">
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">Nome completo</label>
            <input className="input-dark" value={nome} onChange={e=>setNome(e.target.value)} placeholder="Como esta no RG"/></div>
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">E-mail</label>
            <input className="input-dark" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"/></div>
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">Telefone</label>
            <input className="input-dark" value={tel} onChange={e=>setTel(e.target.value)} placeholder="(18) 9 0000-0000"/></div>
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">Senha (min. 8 caracteres)</label>
            <input className="input-dark" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Minimo 8 caracteres"/>
            {pw.length>0&&pw.length<8&&<span className="mt-1 block text-[11px] text-rose-400">A senha precisa ter ao menos 8 caracteres.</span>}</div>
          <div><label className="mb-1.5 block text-xs font-medium text-white/50">Confirmar senha</label>
            <input className="input-dark" type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="Repita a senha"/>
            {pw2.length>0&&pw!==pw2&&<span className="mt-1 block text-[11px] text-rose-400">As senhas nao coincidem.</span>}</div>
          {err&&<p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{err}</p>}
          <button onClick={goCadastro} disabled={busy||!nome||!email||pw.length<8||pw!==pw2} className="btn-primary flex items-center justify-center gap-2">{busy?<Spinner/>:<><UserPlus className="h-4 w-4"/>Criar conta</>}</button>
        </div>
      )}
    </div>
    <p className="mt-10 text-[10px] text-white/20">Transporte Academico Municipal</p>
  </div>}
