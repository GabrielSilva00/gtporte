/** Abas do app do motorista (menu de baixo). */
export const ABAS = [
  { id: 'viagem', titulo: 'Viagem' },
  { id: 'checkin', titulo: 'Check-in' },
  { id: 'rotas', titulo: 'Rotas' },
  { id: 'mensagens', titulo: 'Mensagens' },
  { id: 'perfil', titulo: 'Perfil' },
] as const

export type Tab = (typeof ABAS)[number]['id']

/** Telas dentro do Perfil. */
export type SubPerfil = 'historico' | 'documentos' | null

/**
 * Para onde leva o toque numa notificacao. "documentos" e "historico"
 * moram dentro do Perfil; o resto e uma aba.
 */
export type Destino = Tab | 'documentos' | 'historico'

const DESTINOS: readonly string[] = [...ABAS.map((a) => a.id), 'documentos', 'historico']

export function destinoValido(d: string | null | undefined): Destino | undefined {
  return d && DESTINOS.includes(d) ? (d as Destino) : undefined
}
