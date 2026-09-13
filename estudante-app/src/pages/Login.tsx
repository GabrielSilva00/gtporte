import { useState } from 'react'
import { CloudOff, Eye, EyeOff, GraduationCap, LogIn, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useConexao } from '@/hooks/useConexao'
import { REGRAS_SENHA, validarSenha } from '@/lib/validarSenha'

type Props = {
  onLogin: (e: string, p: string) => Promise<void>
  onCadastrar: (n: string, e: string, t: string, p: string) => Promise<unknown>
}

export function Login({ onLogin, onCadastrar }: Props) {
  const [tab, setTab] = useState<'login' | 'cadastro'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { situacao } = useConexao()
  const offline = situacao === 'offline'

  // Fonte unica da regra: o mesmo modulo usado na validacao final.
  const resultado = validarSenha(pw)

  const goLogin = async () => {
    if (!email || !pw) return
    setErr('')
    setBusy(true)
    try {
      await onLogin(email.trim(), pw)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const goCadastro = async () => {
    if (!nome || !email || !resultado.valida || pw !== pw2) return
    setErr('')
    setBusy(true)
    try {
      await onCadastrar(nome, email, tel, pw)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-10">
      {/* brilho de fundo, puramente decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl"
      />

      <div className="anim-in relative mb-8 flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10 ring-1 ring-brand-500/20">
          <GraduationCap className="h-10 w-10 text-brand-500" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">GTPORTE</h1>
        <p className="text-sm text-muted">Portal do Estudante</p>
      </div>

      <div className="anim-in relative w-full max-w-sm" style={{ animationDelay: '.15s' }}>
        {offline && (
          <div className="aviso-err mb-4">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div>
              <p className="text-sm font-semibold text-err">Sem conexao</p>
              <p className="mt-0.5 text-xs text-muted">Conecte-se a internet para entrar.</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex rounded-xl bg-raised/70 p-1">
          {(['login', 'cadastro'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setErr('')
              }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                tab === t ? 'bg-brand-600 text-white shadow-card' : 'text-muted'
              }`}
            >
              {t === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">E-mail</span>
              <input
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goLogin()}
                placeholder="seu@email.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Senha</span>
              <div className="relative">
                <input
                  className="field pr-12"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && goLogin()}
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>
            {err && <p className="rounded-xl bg-err/10 px-4 py-3 text-sm text-err">{err}</p>}
            <button
              onClick={goLogin}
              disabled={busy || offline}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {busy ? <Spinner /> : (
                <>
                  <LogIn className="h-4 w-4" />
                  Entrar
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Nome completo</span>
              <input
                className="field"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como esta no RG"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">E-mail</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Telefone</span>
              <input
                className="field"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                placeholder="(18) 9 0000-0000"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Senha</span>
              <input
                className="field"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Crie uma senha"
              />
            </label>

            {pw.length > 0 && (
              <ul className="grid grid-cols-2 gap-1 rounded-xl bg-raised/50 p-3">
                {REGRAS_SENHA.map((r) => {
                  const ok = r.ok(pw)
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-ok' : 'text-muted'}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-ok' : 'bg-faint'}`} />
                      {r.rotulo}
                    </li>
                  )
                })}
              </ul>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Confirmar senha</span>
              <input
                className="field"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Repita a senha"
              />
              {pw2.length > 0 && pw !== pw2 && (
                <span className="mt-1 block text-[11px] text-err">As senhas nao coincidem.</span>
              )}
            </label>

            {err && <p className="rounded-xl bg-err/10 px-4 py-3 text-sm text-err">{err}</p>}
            <button
              onClick={goCadastro}
              disabled={busy || offline || !nome || !email || !resultado.valida || pw !== pw2}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {busy ? <Spinner /> : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Criar conta
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <p className="relative mt-10 text-[10px] text-faint">Transporte Academico Municipal</p>
    </div>
  )
}
