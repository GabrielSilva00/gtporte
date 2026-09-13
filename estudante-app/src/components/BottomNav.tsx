import { Bus, FileText, History, Home, MessageCircle, User } from 'lucide-react'

const tabs = [
  { id: 'inicio', icon: Home, label: 'Início' },
  { id: 'rota', icon: Bus, label: 'Rota' },
  { id: 'documentos', icon: FileText, label: 'Docs' },
  { id: 'historico', icon: History, label: 'Histór.' },
  { id: 'feedback', icon: MessageCircle, label: 'Msgs' },
  { id: 'perfil', icon: User, label: 'Perfil' },
] as const

export type Tab = (typeof tabs)[number]['id']

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line/60 bg-surface/95 backdrop-blur-xl safe-b">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const sel = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={sel ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${sel ? 'text-brand-500' : 'text-muted'}`}
            >
              {sel && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500" />}
              <t.icon className="h-5 w-5" strokeWidth={sel ? 2.2 : 1.6} />
              <span className="text-[9px] font-medium">{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
