import { useEffect } from 'react'
import { Lock, LogOut, X } from 'lucide-react'
import { SECOES, type Tab } from '@/lib/navegacao'

/**
 * Menu lateral das telas internas, aberto pelo botão do cabeçalho. A tela
 * inicial não tem o botão: lá a navegação acontece pelos cards.
 */
export function MenuLateral({
  aberto,
  ativa,
  bloqueadas = [],
  nome,
  prontuario,
  onIr,
  onFechar,
  onSair,
}: {
  aberto: boolean
  ativa: Tab
  bloqueadas?: Tab[]
  nome: string
  prontuario?: string | null
  onIr: (t: Tab) => void
  onFechar: () => void
  onSair: () => void
}) {
  // Fecha no Esc e trava a rolagem do fundo enquanto estiver aberto.
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', aoTeclar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[98] flex" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <nav
        className="anim-in relative flex h-full w-[80%] max-w-xs flex-col bg-surface shadow-lift"
        onClick={(e) => e.stopPropagation()}
        aria-label="Menu principal"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{nome}</p>
            {prontuario && (
              <p className="mt-0.5 font-mono text-[11px] text-muted">Prontuário {prontuario}</p>
            )}
          </div>
          <button onClick={onFechar} aria-label="Fechar menu" className="shrink-0">
            <X className="h-5 w-5 text-faint" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {SECOES.map((item) => {
            const sel = ativa === item.id
            const travada = bloqueadas.includes(item.id)
            return (
              <button
                key={item.id}
                onClick={() => {
                  onIr(item.id)
                  onFechar()
                }}
                aria-current={sel ? 'page' : undefined}
                className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-colors ${
                  sel ? 'bg-brand-500/10 font-semibold text-brand-500' : 'text-ink'
                }`}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{item.label}</span>
                {travada && <Lock className="h-3.5 w-3.5 shrink-0 text-warn" />}
              </button>
            )
          })}
        </div>

        <button
          onClick={onSair}
          className="flex items-center gap-3 border-t border-line/60 px-5 py-4 text-sm font-semibold text-err"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair da conta
        </button>
      </nav>
    </div>
  )
}
