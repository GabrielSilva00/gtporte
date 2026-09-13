import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema, type Tema } from '@/hooks/useTema'

const OPCOES: { id: Tema; label: string; Icone: typeof Sun }[] = [
  { id: 'claro', label: 'Claro', Icone: Sun },
  { id: 'escuro', label: 'Escuro', Icone: Moon },
  { id: 'sistema', label: 'Sistema', Icone: Monitor },
]

export function SeletorTema() {
  const { tema, setTema } = useTema()

  return (
    <div className="flex rounded-xl bg-raised/70 p-1">
      {OPCOES.map((o) => {
        const ativo = tema === o.id
        return (
          <button
            key={o.id}
            onClick={() => setTema(o.id)}
            aria-pressed={ativo}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              ativo ? 'bg-surface text-brand-500 shadow-card' : 'text-muted'
            }`}
          >
            <o.Icone className="h-3.5 w-3.5" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
