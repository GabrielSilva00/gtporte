export interface ItemAba<T extends string> {
  chave: T
  rotulo: string
  /** Número exibido ao lado do rótulo (ex.: pendências na fila). */
  contador?: number
  /** Ponto de atenção: campos obrigatórios vazios, itens aguardando decisão. */
  alerta?: boolean
  desabilitada?: boolean
}

interface Props<T extends string> {
  abas: ItemAba<T>[]
  ativa: T
  onMudar: (chave: T) => void
  /** 'sublinhado' para navegação de página, 'pilulas' para filtros. */
  variante?: 'sublinhado' | 'pilulas'
  /** 'vertical' vira índice lateral, usado quando há muitos blocos. */
  orientacao?: 'horizontal' | 'vertical'
  className?: string
}

/**
 * Navegação por abas, controlada. O consumidor renderiza o painel ativo
 * com `{aba === 'x' && <... />}`, como já é feito no resto do projeto.
 */
export function Tabs<T extends string>({
  abas,
  ativa,
  onMudar,
  variante = 'sublinhado',
  orientacao = 'horizontal',
  className = '',
}: Props<T>) {
  const vertical = orientacao === 'vertical'

  return (
    <div
      role="tablist"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={`${
        vertical
          ? 'flex flex-col gap-0.5'
          : variante === 'sublinhado'
            ? 'flex gap-1 overflow-x-auto border-b border-line'
            : 'flex flex-wrap gap-1.5'
      } ${className}`}
    >
      {abas.map((aba) => {
        const selecionada = aba.chave === ativa
        return (
          <button
            key={aba.chave}
            type="button"
            role="tab"
            aria-selected={selecionada}
            disabled={aba.desabilitada}
            onClick={() => onMudar(aba.chave)}
            className={classe(variante, vertical, selecionada, !!aba.desabilitada)}
          >
            <span className="whitespace-nowrap">{aba.rotulo}</span>
            {aba.contador !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px font-mono text-[10px] ${
                  selecionada ? 'bg-white/20' : 'bg-tint text-muted'
                }`}
              >
                {aba.contador}
              </span>
            )}
            {aba.alerta && !selecionada && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Há campos pendentes" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function classe(
  variante: 'sublinhado' | 'pilulas',
  vertical: boolean,
  selecionada: boolean,
  desabilitada: boolean,
) {
  const base =
    'inline-flex items-center gap-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-45'

  if (vertical) {
    return `${base} w-full justify-between rounded-field px-3 py-2 text-left ${
      selecionada
        ? 'bg-primary font-medium text-primary-fg'
        : desabilitada
          ? 'text-soft'
          : 'text-muted hover:bg-tint hover:text-ink'
    }`
  }

  if (variante === 'pilulas') {
    return `${base} rounded-full border px-3 py-1.5 ${
      selecionada
        ? 'border-primary bg-primary font-medium text-primary-fg'
        : 'border-edge bg-surface text-muted hover:bg-bg hover:text-ink'
    }`
  }

  return `${base} -mb-px border-b-2 px-3 py-2.5 ${
    selecionada
      ? 'border-primary font-medium text-ink'
      : 'border-transparent text-muted hover:text-ink'
  }`
}
