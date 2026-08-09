import { corOcupacao } from '../../lib/format'

interface Props {
  percentual: number
  altura?: number
  largura?: number | string
}

/** Barra de ocupação com a cor derivada do percentual (verde/âmbar/vermelho). */
export function ProgressBar({ percentual, altura = 6, largura = '100%' }: Props) {
  const pct = Math.min(100, Math.max(0, percentual))
  return (
    <div
      className="overflow-hidden rounded-full bg-tint"
      style={{ height: altura, width: largura }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct}%`, background: corOcupacao(percentual) }}
      />
    </div>
  )
}
