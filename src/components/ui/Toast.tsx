import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { IconeAlerta, IconeCheck, IconeErro, IconeFechar } from '../icons'

export type TipoToast = 'sucesso' | 'alerta' | 'erro'

interface Toast {
  id: number
  tipo: TipoToast
  texto: string
}

interface ToastContexto {
  notificar: (tipo: TipoToast, texto: string) => void
  sucesso: (texto: string) => void
  alerta: (texto: string) => void
  erro: (texto: string) => void
}

const Ctx = createContext<ToastContexto | null>(null)

const ESTILO: Record<TipoToast, { bg: string; fg: string; Icone: typeof IconeCheck }> = {
  sucesso: { bg: '#EAF3EC', fg: '#2E7D5A', Icone: IconeCheck },
  alerta: { bg: '#FBEEDA', fg: '#8A5A15', Icone: IconeAlerta },
  erro: { bg: '#FBECEC', fg: '#9E3E3E', Icone: IconeErro },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id))
  }, [])

  const notificar = useCallback(
    (tipo: TipoToast, texto: string) => {
      const id = Date.now() + Math.random()
      setToasts((atual) => [...atual, { id, tipo, texto }])
      window.setTimeout(() => remover(id), 6000)
    },
    [remover],
  )

  const valor = useMemo<ToastContexto>(
    () => ({
      notificar,
      sucesso: (t) => notificar('sucesso', t),
      alerta: (t) => notificar('alerta', t),
      erro: (t) => notificar('erro', t),
    }),
    [notificar],
  )

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-2">
        {toasts.map((t) => {
          const { bg, fg, Icone } = ESTILO[t.tipo]
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-card border border-edge p-3 shadow-sm"
              style={{ background: bg }}
            >
              <span style={{ color: fg }} className="mt-0.5 shrink-0">
                <Icone size={16} />
              </span>
              <div className="flex-1 text-[12.5px] leading-relaxed" style={{ color: fg }}>
                {t.texto}
              </div>
              <button
                onClick={() => remover(t.id)}
                className="shrink-0 text-soft hover:text-ink"
                aria-label="Fechar aviso"
              >
                <IconeFechar size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastContexto {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
