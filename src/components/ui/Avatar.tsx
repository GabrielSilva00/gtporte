import { corAvatar, iniciais } from '../../lib/format'

interface Props {
  nome: string
  tamanho?: number
  cor?: string
}

export function Avatar({ nome, tamanho = 30, cor }: Props) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: tamanho,
        height: tamanho,
        background: cor ?? corAvatar(nome),
        fontSize: Math.round(tamanho * 0.37),
      }}
    >
      {iniciais(nome)}
    </span>
  )
}
