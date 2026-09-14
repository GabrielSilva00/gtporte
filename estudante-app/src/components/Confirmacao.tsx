import { AlertTriangle, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

/**
 * Janela de confirmacao para acoes que o usuario nao desfaz sozinho.
 * Rola por dentro: em tela pequena o botao de acao nao pode ficar fora
 * da area visivel.
 */
export function Confirmacao({
  titulo,
  mensagem,
  detalhe,
  rotuloConfirmar = 'Confirmar',
  perigo = false,
  ocupado = false,
  onConfirmar,
  onCancelar,
}: {
  titulo: string
  mensagem: string
  detalhe?: string
  rotuloConfirmar?: string
  perigo?: boolean
  ocupado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[97] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={ocupado ? undefined : onCancelar}
    >
      <div
        className="anim-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                perigo ? 'bg-err/10 text-err' : 'bg-warn/10 text-warn'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold">{titulo}</h3>
          </div>
          <button onClick={onCancelar} disabled={ocupado} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-faint" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-ink/80">{mensagem}</p>
        {detalhe && (
          <p className="mt-3 rounded-lg bg-raised/60 p-3 text-xs text-muted">{detalhe}</p>
        )}

        <div className="mt-5 flex gap-2.5">
          <button onClick={onCancelar} disabled={ocupado} className="btn-outline">
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={ocupado}
            className={perigo ? 'btn-danger' : 'btn-primary'}
          >
            {ocupado ? <Spinner className="mx-auto" /> : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
