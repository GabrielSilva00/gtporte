import { useEffect } from 'react'
import { IconeFechar } from '../icons'

interface Props {
  aberto: boolean
  titulo: string
  descricao?: string
  largura?: number
  onFechar: () => void
  children: React.ReactNode
  rodape?: React.ReactNode
}

export function Modal({ aberto, titulo, descricao, largura = 640, onFechar, children, rodape }: Props) {
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/25 p-6 backdrop-blur-[1px]">
      <div
        className="my-auto w-full rounded-card border border-edge bg-surface shadow-xl"
        style={{ maxWidth: largura }}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="text-[16px] font-semibold">{titulo}</h2>
            {descricao && <p className="mt-1 text-[12.5px] text-muted">{descricao}</p>}
          </div>
          <button onClick={onFechar} className="text-soft hover:text-ink" aria-label="Fechar">
            <IconeFechar size={16} />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {rodape && (
          <div className="flex justify-end gap-2 border-t border-edge px-6 py-4">{rodape}</div>
        )}
      </div>
    </div>
  )
}
