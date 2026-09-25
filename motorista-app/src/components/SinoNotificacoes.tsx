import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, FileWarning, MessageCircle, UserX, Hand, X } from 'lucide-react'
import { useNotificacoes, type TipoNotificacao } from '@/hooks/useNotificacoes'
import type { Destino } from '@/lib/navegacao'
import { ativarPush, permissaoNotificacao, suportaNotificacao } from '@/lib/push'
import { toast } from '@/components/Toast'

const ICONE: Record<TipoNotificacao, typeof Bell> = {
  mensagem: MessageCircle,
  pedido: Hand,
  cancelamento: UserX,
  documento: FileWarning,
  aviso: Bell,
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
 * Sino do cabecalho, igual ao do app do estudante: mensagens de alunos,
 * pedidos de volta e de troca de onibus, cancelamentos do dia e
 * documentos. Tocar num item leva a tela que resolve o assunto.
 */
export function SinoNotificacoes({ onIr }: { onIr: (d: Destino) => void }) {
  const { itens, naoLidas, marcarTodasLidas, lidas } = useNotificacoes()
  const [aberto, setAberto] = useState(false)
  const [permissao, setPermissao] = useState(permissaoNotificacao)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  const abrir = () => {
    setAberto(true)
    // Abrir ja conta como leitura: o painel mostra tudo de uma vez.
    setTimeout(marcarTodasLidas, 600)
  }

  const ligarAvisos = async () => {
    try {
      const r = await ativarPush()
      setPermissao(permissaoNotificacao())
      toast(
        r === 'ativado'
          ? 'Avisos ligados, inclusive com o app fechado.'
          : r === 'so-app-aberto'
            ? 'Avisos ligados enquanto o app estiver aberto.'
            : 'Permissão negada nas configurações do aparelho.',
        r === 'negado' ? 'err' : 'ok',
      )
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-500 transition-transform active:scale-95"
      >
        <Bell className="h-[18px] w-[18px]" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-[#fff] ring-2 ring-navy-900">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {/* Portal: o backdrop-blur do cabecalho prenderia o painel "fixed" dentro dele. */}
      {aberto &&
        createPortal(
          <div
            className="fixed inset-0 z-[96] flex items-start justify-center bg-black/60 pt-[calc(env(safe-area-inset-top)+3.75rem)] backdrop-blur-sm"
            onClick={() => setAberto(false)}
          >
            <div
              className="anim-in max-h-[75vh] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-navy-800 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Notificações"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <h3 className="text-sm font-bold">Notificações</h3>
                <button onClick={() => setAberto(false)} aria-label="Fechar" className="p-1">
                  <X className="h-4 w-4 text-white/40" />
                </button>
              </div>

              {suportaNotificacao() && permissao === 'default' && (
                <button
                  onClick={ligarAvisos}
                  className="flex w-full items-center gap-3 border-b border-white/[0.06] bg-gold-500/10 px-4 py-3 text-left"
                >
                  <BellRing className="h-4 w-4 flex-shrink-0 text-gold-500" />
                  <span className="flex-1 text-xs font-semibold">Receber avisos no celular</span>
                  <span className="text-[11px] font-bold text-gold-500">Ativar</span>
                </button>
              )}

              <div className="max-h-[calc(75vh-3rem)] overflow-y-auto">
                {itens.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <Bell className="mx-auto mb-3 h-10 w-10 text-white/10" />
                    <p className="text-sm text-white/40">Nada por aqui ainda.</p>
                  </div>
                ) : (
                  itens.map((n) => {
                    const Icone = ICONE[n.tipo]
                    const nova = !lidas.has(n.id)
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          marcarTodasLidas()
                          if (n.destino) onIr(n.destino)
                          setAberto(false)
                        }}
                        className={`flex w-full items-start gap-3 border-b border-white/[0.04] px-4 py-3 text-left last:border-0 ${
                          nova ? 'bg-gold-500/[0.06]' : ''
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            n.urgente ? 'bg-rose-500/15 text-rose-400' : 'bg-gold-500/10 text-gold-500'
                          }`}
                        >
                          <Icone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13px] font-semibold">{n.titulo}</span>
                            <span className="shrink-0 text-[11px] text-white/30">{quandoRelativo(n.quando)}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-white/50">{n.detalhe}</span>
                        </span>
                        {nova && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-500" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
