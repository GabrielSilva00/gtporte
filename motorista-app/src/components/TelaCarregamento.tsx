import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/Spinner'
import type { CoresCena } from '@/components/carregamento/cenaVan'

// Mesmo com o app pronto antes, a van fica na tela por esse tempo depois de aparecer.
const TEMPO_MINIMO_MS = 2500
// Se o 3D demorar (rede lenta), o app não espera por ele mais do que isso.
const ESPERA_MAXIMA_MS = 3000
const SAIDA_MS = 500

type Fase = 'visivel' | 'saindo' | 'oculta'

function corDoTema(variavel: string, reserva: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(variavel).trim()
  return valor ? `rgb(${valor.split(/\s+/).join(',')})` : reserva
}

// Dourado do app e a cor do texto (branca no escuro, quase preta no claro); ver src/index.css.
function coresDoTema(): CoresCena {
  return {
    rastro: corDoTema('--gold-500', '#EAB308'),
    rastroClaro: corDoTema('--gold-400', '#FACC15'),
    faixa: corDoTema('--ink', '#FFFFFF'),
    sombra: '#000000',
  }
}

function CenaVan({ onPronta, onFalha }: { onPronta: () => void; onFalha: () => void }) {
  const palco = useRef<HTMLDivElement>(null)
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    let cancelado = false
    let desmontar: (() => void) | undefined
    import('@/components/carregamento/cenaVan')
      .then(({ montarCenaVan }) => {
        if (cancelado || !palco.current) return
        desmontar = montarCenaVan(palco.current, coresDoTema(), 'Van do transporte universitário em movimento')
        setPronta(true)
        onPronta()
      })
      .catch(() => {
        if (!cancelado) onFalha()
      })
    return () => {
      cancelado = true
      desmontar?.()
    }
  }, [onPronta, onFalha])

  return (
    <div
      ref={palco}
      className={`aspect-[16/9] w-full max-w-[240px] [mask-image:linear-gradient(to_right,transparent,black_22%,black_88%,transparent)] transition-opacity duration-500 motion-reduce:transition-none ${pronta ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

/**
 * Camada de carregamento em tela cheia: a van do transporte andando e deixando um rastro de
 * partículas. Fica montada na raiz do app; aparece enquanto `carregando` for verdadeiro,
 * permanece pelo menos TEMPO_MINIMO_MS e sai com um fade.
 */
export function TelaCarregamento({ carregando, texto = 'Carregando…' }: { carregando: boolean; texto?: string }) {
  const [fase, setFase] = useState<Fase>(carregando ? 'visivel' : 'oculta')
  const [semWebgl, setSemWebgl] = useState(false)
  // Momento em que a animação ficou visível; o tempo mínimo conta a partir daqui.
  const [vistaDesde, setVistaDesde] = useState<number | null>(null)
  const oculta = fase === 'oculta'

  useEffect(() => {
    if (carregando) {
      setFase('visivel')
      return
    }
    if (oculta) return
    const restante =
      vistaDesde === null
        ? ESPERA_MAXIMA_MS
        : Math.max(0, TEMPO_MINIMO_MS - (performance.now() - vistaDesde))
    const paraSaida = setTimeout(() => setFase('saindo'), restante)
    const paraOcultar = setTimeout(() => setFase('oculta'), restante + SAIDA_MS)
    return () => {
      clearTimeout(paraSaida)
      clearTimeout(paraOcultar)
    }
  }, [carregando, oculta, vistaDesde])

  // A cena é desmontada ao ocultar; numa próxima exibição a contagem recomeça.
  useEffect(() => {
    if (oculta) setVistaDesde(null)
  }, [oculta])

  const pronta = useRef(() => setVistaDesde(performance.now())).current
  const falhou = useRef(() => {
    setSemWebgl(true)
    setVistaDesde(performance.now())
  }).current

  if (oculta) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={fase === 'visivel'}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-1 bg-navy-900 px-6 transition-opacity motion-reduce:transition-none ${fase === 'saindo' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${SAIDA_MS}ms` }}
    >
      {semWebgl ? <Spinner className="h-8 w-8" /> : <CenaVan onPronta={pronta} onFalha={falhou} />}
      <p className="text-sm text-white/50">{texto}</p>
    </div>
  )
}
