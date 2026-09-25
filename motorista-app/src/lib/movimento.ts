/**
 * Situacao automatica da viagem a partir do GPS.
 *
 * Com o rastreamento ligado, cada leitura do GPS diz se o onibus esta
 * andando ou parado:
 *  - andando: velocidade acima de ~11 km/h (o GPS informa) ou mais de
 *    150 m desde o ultimo ponto de parada, em duas leituras seguidas —
 *    uma so pode ser salto do sinal;
 *  - parado: 5 minutos dentro de um raio de 60 m.
 * Parada curta (semaforo, embarque num ponto) nao chega aos 5 minutos e
 * nao mexe na situacao. Leituras imprecisas (mais de 60 m de erro) sao
 * ignoradas.
 *
 * Funcoes puras: o componente guarda o estado e decide o que gravar.
 */

export interface Leitura {
  lat: number
  lng: number
  /** ms (Date.now ou timestamp do GPS) */
  t: number
  /** m/s, quando o aparelho informa */
  velocidade?: number | null
  /** margem de erro em metros */
  precisao?: number | null
}

export interface EstadoMovimento {
  ancora: { lat: number; lng: number; t: number } | null
  movendoSeguidas: number
}

export type Movimento = 'movendo' | 'parado' | 'indefinido'

export const LIMITES = {
  precisaoMaxM: 60,
  raioParadoM: 60,
  distanciaMovendoM: 150,
  velocidadeMovendoMs: 3,
  paradoMs: 5 * 60_000,
  leiturasMovendo: 2,
}

export const ESTADO_INICIAL: EstadoMovimento = { ancora: null, movendoSeguidas: 0 }

/** Distancia em metros entre dois pontos (haversine). */
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function avaliarLeitura(estado: EstadoMovimento, p: Leitura): { estado: EstadoMovimento; movimento: Movimento } {
  if (p.precisao != null && p.precisao > LIMITES.precisaoMaxM) return { estado, movimento: 'indefinido' }
  const ponto = { lat: p.lat, lng: p.lng, t: p.t }
  if (!estado.ancora) return { estado: { ancora: ponto, movendoSeguidas: 0 }, movimento: 'indefinido' }

  const d = distanciaM(estado.ancora, p)
  const rapido = (p.velocidade ?? 0) >= LIMITES.velocidadeMovendoMs
  if (rapido || d > LIMITES.distanciaMovendoM) {
    const seguidas = estado.movendoSeguidas + 1
    // O ponto de parada acompanha o onibus enquanto ele anda.
    const novo = { ancora: ponto, movendoSeguidas: seguidas }
    return { estado: novo, movimento: seguidas >= LIMITES.leiturasMovendo ? 'movendo' : 'indefinido' }
  }

  if (d > LIMITES.raioParadoM) {
    // Andou pouco (manobra, fila): recomeca a contar a parada daqui.
    return { estado: { ancora: ponto, movendoSeguidas: 0 }, movimento: 'indefinido' }
  }

  const semAndar = { ancora: estado.ancora, movendoSeguidas: 0 }
  return { estado: semAndar, movimento: p.t - estado.ancora.t >= LIMITES.paradoMs ? 'parado' : 'indefinido' }
}

/** Nova situacao sugerida, ou null para deixar como esta. Concluida so muda na mao. */
export function situacaoSugerida(
  atual: 'aguardando' | 'em_rota' | 'concluida',
  movimento: Movimento,
): 'aguardando' | 'em_rota' | null {
  if (atual === 'aguardando' && movimento === 'movendo') return 'em_rota'
  if (atual === 'em_rota' && movimento === 'parado') return 'aguardando'
  return null
}
