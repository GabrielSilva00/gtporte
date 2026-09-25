import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/Spinner'
import type { CoresCena } from '@/components/carregamento/cenaVan'

// Esperas curtas não mostram animação: um loader que pisca por 100 ms parece defeito.
const ATRASO_MS = 300

function corDoTema(variavel: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim()
  return valor ? `rgb(${valor.split(/\s+/).join(',')})` : '#1d4ed8'
}

function coresDoTema(): CoresCena {
  return {
    rastro: corDoTema('--c-brand'),
    rastroClaro: corDoTema('--c-info'),
    faixa: corDoTema('--c-muted'),
    sombra: corDoTema('--c-shadow'),
  }
}

/** Tela cheia de carregamento: a van do transporte andando e deixando um rastro de partículas. */
export function TelaCarregamento({ texto = 'Carregando…' }: { texto?: string }) {
  const palco = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)
  const [semWebgl, setSemWebgl] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), ATRASO_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!visivel) return
    let cancelado = false
    let desmontar: (() => void) | undefined
    import('@/components/carregamento/cenaVan')
      .then(({ montarCenaVan }) => {
        if (cancelado || !palco.current) return
        desmontar = montarCenaVan(palco.current, coresDoTema(), 'Van do transporte universitário em movimento')
      })
      .catch(() => {
        if (!cancelado) setSemWebgl(true)
      })
    return () => {
      cancelado = true
      desmontar?.()
    }
  }, [visivel])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-screen flex-col items-center justify-center gap-2 px-6"
    >
      {semWebgl ? (
        <Spinner className="h-8 w-8" />
      ) : (
        <div
          ref={palco}
          className={`aspect-[16/9] w-full max-w-md [mask-image:linear-gradient(to_right,transparent,black_22%,black_88%,transparent)] transition-opacity duration-500 motion-reduce:transition-none ${visivel ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <p className={`text-sm text-muted transition-opacity duration-500 ${visivel ? 'opacity-100' : 'opacity-0'}`}>
        {texto}
      </p>
    </div>
  )
}
