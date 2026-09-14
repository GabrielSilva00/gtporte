import { useState } from 'react'
import { Bell, FileWarning, Megaphone, MessageCircle, UserCog, X } from 'lucide-react'
import { useNotificacoes, type TipoNotificacao } from '@/hooks/useNotificacoes'
import type { Tab } from '@/lib/navegacao'

const ICONE: Record<TipoNotificacao, typeof Bell> = {
  comunicado: Megaphone,
  documento: FileWarning,
  mensagem: MessageCircle,
  cadastro: UserCog,
}

function quandoRelativo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Sino fixo no canto superior direito. Junta avisos da secretaria,
 * documento recusado, mensagem recebida e alteracao cadastral revisada.
 */
export function SinoNotificacoes({
  estudanteId,
  onIr,
}: {
  estudanteId: string | null
  onIr: (t: Tab) => void
}) {
  const { itens, naoLidas, marcarTodasLidas, lidas } = useNotificacoes(estudanteId)
  const [aberto, setAberto] = useState(false)

  const abrir = () => {
    setAberto(true)
    // Abrir ja conta como leitura: o painel mostra tudo de uma vez.
    setTimeout(marcarTodasLidas, 600)
  }

  return (
    <>
      <button
        onClick={abrir}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-[101] flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift transition-transform active:scale-95"
      >
        <Bell className="h-5 w-5" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] ring-2 ring-surface items-center justify-center rounded-full bg-err px-1 text-[11px] font-bold text-white">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[96] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setAberto(false)}
        >
          <div
            className="anim-in mb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl bg-surface shadow-lift"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
              <h3 className="text-sm font-bold">Notificações</h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <X className="h-4 w-4 text-faint" />
              </button>
            </div>

            <div className="max-h-[calc(70vh-3rem)] overflow-y-auto">
              {itens.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Bell className="mx-auto mb-3 h-10 w-10 text-faint/50" />
                  <p className="text-sm text-muted">Nada por aqui ainda.</p>
                </div>
              ) : (
                itens.map((n) => {
                  const Icone = ICONE[n.tipo]
                  const nova = !lidas.has(n.id)
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (n.destino) onIr(n.destino)
                        setAberto(false)
                      }}
                      className={`flex w-full items-start gap-3 border-b border-line/40 px-4 py-3 text-left transition-colors last:border-0 ${
                        nova ? 'bg-brand-500/[0.06]' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          n.urgente ? 'bg-err/10 text-err' : 'bg-brand-500/10 text-brand-500'
                        }`}
                      >
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold">{n.titulo}</span>
                          <span className="shrink-0 text-[11px] text-faint">
                            {quandoRelativo(n.quando)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                          {n.detalhe}
                        </span>
                      </span>
                      {nova && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
