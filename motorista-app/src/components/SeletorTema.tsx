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
    <div className="flex rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Cor do aplicativo">
      {OPCOES.map((o) => {
        const ativo = tema === o.id
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={ativo}
            onClick={() => setTema(o.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-colors ${
              ativo ? 'bg-gold-500 text-gold-ink' : 'text-white/50'
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
