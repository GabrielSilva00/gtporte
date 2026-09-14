import { useState } from 'react'
import { CloudOff, Eye, EyeOff, GraduationCap, LogIn, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useConexao } from '@/hooks/useConexao'

type Props = {
  onLogin: (e: string, p: string) => Promise<void>
  /** Abre o cadastro em passos; a conta so e criada no fim dele. */
  onCriarConta: () => void
}

export function Login({ onLogin, onCriarConta }: Props) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { situacao } = useConexao()
  const offline = situacao === 'offline'

  const entrar = async () => {
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

      <div className="anim-in relative w-full max-w-sm space-y-3" style={{ animationDelay: '.15s' }}>
        {offline && (
          <div className="aviso-err">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div>
              <p className="text-sm font-semibold text-err">Sem conexão</p>
              <p className="mt-0.5 text-xs text-muted">Conecte-se à internet para entrar.</p>
            </div>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">E-mail</span>
          <input
            className="field"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
            placeholder="seu@email.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Senha</span>
          <div className="relative">
            <input
              className="field pr-11"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && entrar()}
              placeholder="Sua senha"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {err && <p className="rounded-lg bg-err/10 px-3 py-2.5 text-sm text-err">{err}</p>}

        <button
          onClick={entrar}
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

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] text-faint">ou</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          onClick={onCriarConta}
          disabled={offline}
          className="btn-outline flex items-center justify-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Criar conta de estudante
        </button>
      </div>

      <p className="relative mt-10 text-[11px] text-faint">Transporte Acadêmico Municipal</p>
    </div>
  )
}
