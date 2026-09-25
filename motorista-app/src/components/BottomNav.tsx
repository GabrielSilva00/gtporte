import { Bus, CalendarDays, MessageCircle, ScanLine, User } from 'lucide-react'
import type { Tab } from '@/lib/navegacao'

// Cinco abas e o limite confortavel numa tela de 360px. Avisos saiu: o
// recado para todos os alunos agora e mandado no grupo da rota, que ja
// notifica cada aluno (tg_notifica_mensagem, 0027). No lugar entrou Rotas,
// com os alunos de cada dia. Historico e Documentos ficam no Perfil.
const tabs: { id: Tab; icon: typeof Bus; label: string }[] = [
  { id: 'viagem', icon: Bus, label: 'Viagem' },
  { id: 'checkin', icon: ScanLine, label: 'Check-in' },
  { id: 'rotas', icon: CalendarDays, label: 'Rotas' },
  { id: 'mensagens', icon: MessageCircle, label: 'Mensagens' },
  { id: 'perfil', icon: User, label: 'Perfil' },
]

export function BottomNav({ active, onChange, naoLidas }: { active: Tab; onChange: (t: Tab) => void; naoLidas: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-navy-900/95 backdrop-blur-xl safe-b">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const sel = active === t.id
          const contador = t.id === 'mensagens' && naoLidas > 0
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={sel ? 'page' : undefined}
              aria-label={contador ? `${t.label}, ${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${sel ? 'text-gold-500' : 'text-white/40'}`}
            >
              <span className="relative">
                <t.icon className="h-5 w-5" strokeWidth={sel ? 2.2 : 1.6} />
                {contador && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-[#fff] ring-2 ring-navy-900">
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
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
