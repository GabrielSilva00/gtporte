import { Bus, FileText, History, Home, Lock, MessageCircle, User } from 'lucide-react'

const tabs = [
  { id: 'inicio', icon: Home, label: 'Início' },
  { id: 'rota', icon: Bus, label: 'Rota' },
  { id: 'documentos', icon: FileText, label: 'Docs' },
  { id: 'historico', icon: History, label: 'Histór.' },
  { id: 'feedback', icon: MessageCircle, label: 'Msgs' },
  { id: 'perfil', icon: User, label: 'Perfil' },
] as const

export type Tab = (typeof tabs)[number]['id']

export function BottomNav({
  active,
  onChange,
  bloqueadas = [],
}: {
  active: Tab
  onChange: (t: Tab) => void
  /** Abas que dependem de validacao da secretaria: seguem clicaveis, mas marcadas. */
  bloqueadas?: Tab[]
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line/60 bg-surface/95 backdrop-blur-xl safe-b">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const sel = active === t.id
          const travada = bloqueadas.includes(t.id)
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={sel ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${sel ? 'text-brand-500' : 'text-muted'}`}
            >
              {sel && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500" />}
              <span className="relative">
                <t.icon className="h-5 w-5" strokeWidth={sel ? 2.2 : 1.6} />
                {travada && (
                  <Lock className="absolute -right-1.5 -top-1 h-2.5 w-2.5 text-warn" strokeWidth={3} />
                )}
              </span>
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
