import { useEffect, useState } from 'react'
import { CheckCircle, X, XCircle } from 'lucide-react'

let fn: ((m: string, t?: 'ok' | 'err') => void) | null = null
export function toast(m: string, t: 'ok' | 'err' = 'ok') { fn?.(m, t) }

export function ToastContainer() {
  const [q, setQ] = useState<{ id: number; m: string; t: 'ok' | 'err' }[]>([])

  useEffect(() => {
    fn = (m, t = 'ok') => {
      const id = Date.now() + Math.random()
      setQ((p) => [...p, { id, m, t }])
      setTimeout(() => setQ((p) => p.filter((x) => x.id !== id)), 3500)
    }
    return () => { fn = null }
  }, [])

  return (
    <div // pointer-events-none: o container ocupa a faixa do topo mesmo vazio e
      // estava interceptando o clique do sino de notificacoes
      className="pointer-events-none fixed inset-x-4 top-[env(safe-area-inset-top,12px)] z-[100] flex flex-col gap-2 pt-8"
      role="status"
      aria-live="polite">
      {q.map((x) => (
        <div
          key={x.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lift anim-in ${x.t === 'ok' ? 'bg-ok' : 'bg-err'}`}
        >
          {x.t === 'ok' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          <span className="flex-1">{x.m}</span>
          <button onClick={() => setQ((p) => p.filter((y) => y.id !== x.id))} aria-label="Fechar">
            <X className="h-4 w-4 opacity-60" />
          </button>
        </div>
      ))}
    </div>
  )
}
