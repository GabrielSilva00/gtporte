import { useState, type ReactNode } from 'react'
import { Info, X } from 'lucide-react'

/**
 * Campo de formulario que sabe mostrar o estado "Pendente".
 *
 * Quando o estudante grava uma alteracao, ela vai para a fila da secretaria
 * em vez de entrar no cadastro. Ate ser validada, o campo aparece em laranja
 * com o selo "Pendente" e um (i) que explica o que aconteceu.
 */
export function CampoCadastro({
  rotulo,
  pendente,
  recusa,
  children,
}: {
  rotulo: string
  /** Valor aguardando validacao. Quando presente, o campo fica laranja. */
  pendente?: { valor_novo: string | null; criado_em: string } | null
  /** Motivo da ultima recusa, se houver. */
  recusa?: string | null
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)

  const quando = pendente
    ? new Date(pendente.criado_em).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className={pendente ? 'rounded-xl border border-warn/40 bg-warn/5 p-2.5' : ''}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`text-xs font-medium ${pendente ? 'text-warn' : 'text-muted'}`}>
          {rotulo}
        </span>

        {pendente && (
          <>
            <span className="chip-warn px-2 py-0.5 text-[11px]">Pendente</span>
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-label={`O que significa pendente no campo ${rotulo}`}
              className="text-warn"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {children}

      {recusa && !pendente && (
        <p className="mt-1.5 text-[11px] text-err">Alteração recusada: {recusa}</p>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAberto(false)}
        >
          <div
            className="anim-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warn/10 text-warn">
                  <Info className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-bold">Aguardando validação</h3>
              </div>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <X className="h-5 w-5 text-faint" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-ink/80">
              Os dados atualizados foram enviados para a secretaria validar. Até a validação, o
              cadastro continua com o valor anterior.
            </p>

            <div className="mt-4 space-y-1 rounded-xl bg-raised/60 p-3 text-sm">
              <p className="text-[11px] text-muted">{rotulo} — novo valor enviado</p>
              <p className="font-medium">{pendente?.valor_novo || '(vazio)'}</p>
              {quando && <p className="text-[11px] text-faint">Enviado em {quando}</p>}
            </div>

            <button onClick={() => setAberto(false)} className="btn-primary mt-5">
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
