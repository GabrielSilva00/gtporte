import { useEffect, useMemo, useRef, useState } from 'react'
import { iniciais, corAvatar } from '../../lib/format'

interface Props {
  /** URL já assinada/pública da foto atual, se houver. */
  url?: string | null
  /** Arquivo selecionado ainda não enviado — mostrado em preview. */
  arquivo?: File | null
  nome: string
  tamanho?: number
  circular?: boolean
  desabilitado?: boolean
  onSelecionar: (arquivo: File | null) => void
  rotulo?: string
  ajuda?: string
}

/**
 * Seletor de imagem com preview. Cai nas iniciais coloridas quando não há
 * foto, mantendo a mesma identidade visual do Avatar.
 */
export function UploadFoto({
  url,
  arquivo,
  nome,
  tamanho = 88,
  circular = true,
  desabilitado,
  onSelecionar,
  rotulo = 'Foto',
  ajuda = 'JPG ou PNG, até 2 MB.',
}: Props) {
  const input = useRef<HTMLInputElement>(null)

  // Um object URL por arquivo, revogado ao trocar. Criar direto no corpo
  // do render vazaria um blob a cada tecla digitada nos formulários longos
  // que usam este componente.
  const [urlLocal, setUrlLocal] = useState<string | null>(null)
  useEffect(() => {
    if (!arquivo) {
      setUrlLocal(null)
      return
    }
    const gerada = URL.createObjectURL(arquivo)
    setUrlLocal(gerada)
    return () => URL.revokeObjectURL(gerada)
  }, [arquivo])

  const previa = useMemo(() => urlLocal ?? url, [urlLocal, url])

  return (
    <div className="flex items-center gap-3.5">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => input.current?.click()}
        className={`relative shrink-0 overflow-hidden border border-edge transition-opacity hover:opacity-85 disabled:cursor-not-allowed ${
          circular ? 'rounded-full' : 'rounded-card'
        }`}
        style={{ width: tamanho, height: tamanho }}
        title="Escolher imagem"
      >
        {previa ? (
          <img src={previa} alt={rotulo} className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center font-semibold text-white"
            style={{ background: corAvatar(nome || rotulo), fontSize: Math.round(tamanho * 0.3) }}
          >
            {iniciais(nome || rotulo)}
          </span>
        )}
      </button>

      <div className="min-w-0">
        <span className="field-label">{rotulo}</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-[12px]"
            disabled={desabilitado}
            onClick={() => input.current?.click()}
          >
            {previa ? 'Trocar imagem' : 'Escolher imagem'}
          </button>
          {previa && (
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-[12px] text-danger"
              disabled={desabilitado}
              onClick={() => {
                onSelecionar(null)
                if (input.current) input.current.value = ''
              }}
            >
              Remover
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">{ajuda}</p>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onSelecionar(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
