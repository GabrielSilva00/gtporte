import type {
  SituacaoAlocacao,
  SituacaoMotorista,
  SituacaoOperacional,
  SolicitacaoStatus,
  StatusDocumental,
  StatusMotorista,
  StatusRota,
  StatusVeiculo,
} from './types'

/** Iniciais para os avatares circulares do protótipo (ex.: "Marina Rocha" -> "MR"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const PALETA_AVATAR = ['#1F3A2E', '#8A5A15', '#9E3E3E', '#2E7D5A', '#C4633A']

/** Cor estável por nome — o mesmo estudante sempre recebe o mesmo tom. */
export function corAvatar(chave: string): string {
  let hash = 0
  for (let i = 0; i < chave.length; i++) hash = (hash * 31 + chave.charCodeAt(i)) >>> 0
  return PALETA_AVATAR[hash % PALETA_AVATAR.length]
}

/** "05:40:00" -> "05:40" */
export function hora(valor?: string | null): string {
  if (!valor) return '—'
  return valor.slice(0, 5)
}

export function dataBR(valor?: string | null): string {
  if (!valor) return '—'
  const d = new Date(valor.length <= 10 ? `${valor}T12:00:00` : valor)
  return d.toLocaleDateString('pt-BR')
}

export function dataHoraBR(valor?: string | null): string {
  if (!valor) return '—'
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function horaCurta(valor?: string | null): string {
  if (!valor) return '—'
  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function dataExtenso(d = new Date()): string {
  const txt = d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

export function hoje(): string {
  return new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD no fuso local
}

export function numero(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR')
}

export function percentual(usado: number, total: number): number {
  if (!total) return 0
  return Math.round((usado / total) * 100)
}

/** Verde até 75%, âmbar até 94%, vermelho acima — igual às barras do protótipo. */
export function corOcupacao(pct: number): string {
  if (pct >= 95) return '#9E3E3E'
  if (pct >= 76) return '#B8862B'
  return '#2E7D5A'
}

export interface EstiloBadge {
  rotulo: string
  bg: string
  fg: string
}

const VERDE: Omit<EstiloBadge, 'rotulo'> = { bg: '#EAF3EC', fg: '#2E7D5A' }
const AMBAR: Omit<EstiloBadge, 'rotulo'> = { bg: '#FBEEDA', fg: '#8A5A15' }
const VERMELHO: Omit<EstiloBadge, 'rotulo'> = { bg: '#FBECEC', fg: '#9E3E3E' }
const NEUTRO: Omit<EstiloBadge, 'rotulo'> = { bg: '#EEF1EF', fg: '#6B7570' }

export function badgeDocumental(status: StatusDocumental): EstiloBadge {
  switch (status) {
    case 'aprovado':
      return { rotulo: 'Aprovado', ...VERDE }
    case 'rejeitado':
      return { rotulo: 'Rejeitado', ...VERMELHO }
    default:
      return { rotulo: 'Pendente', ...AMBAR }
  }
}

export function badgeRota(status: StatusRota): EstiloBadge {
  switch (status) {
    case 'ativa':
      return { rotulo: 'ATIVA', ...VERDE }
    case 'lotada':
      return { rotulo: 'LOTADA', ...VERMELHO }
    case 'revisao':
      return { rotulo: 'REVISÃO', ...AMBAR }
    default:
      return { rotulo: 'INATIVA', ...NEUTRO }
  }
}

export function badgeVeiculo(status: StatusVeiculo): EstiloBadge {
  switch (status) {
    case 'em_rota':
      return { rotulo: 'EM ROTA', ...VERDE }
    case 'disponivel':
      return { rotulo: 'DISPONÍVEL', ...NEUTRO }
    default:
      return { rotulo: 'MANUTENÇÃO', ...AMBAR }
  }
}

export function badgeMotorista(status: StatusMotorista): EstiloBadge {
  switch (status) {
    case 'em_rota':
      return { rotulo: 'EM ROTA', ...VERDE }
    case 'aguardando':
      return { rotulo: 'AGUARDANDO', ...AMBAR }
    case 'folga':
      return { rotulo: 'FOLGA', ...NEUTRO }
    default:
      return { rotulo: 'INATIVO', ...NEUTRO }
  }
}

export function badgeAlocacao(situacao: SituacaoAlocacao): EstiloBadge {
  switch (situacao) {
    case 'alocado':
      return { rotulo: 'Alocado', ...VERDE }
    case 'fila_espera':
      return { rotulo: 'Fila de espera', ...AMBAR }
    default:
      return { rotulo: 'Sem rota', ...VERMELHO }
  }
}

/** Dias letivos aceitos na grade horária: segunda a sábado.
 *  O número segue a convenção de grade_horaria.dia_semana (0 = domingo). */
export const DIAS_SEMANA: { numero: number; rotulo: string; curto: string }[] = [
  { numero: 1, rotulo: 'Segunda', curto: 'Seg' },
  { numero: 2, rotulo: 'Terça', curto: 'Ter' },
  { numero: 3, rotulo: 'Quarta', curto: 'Qua' },
  { numero: 4, rotulo: 'Quinta', curto: 'Qui' },
  { numero: 5, rotulo: 'Sexta', curto: 'Sex' },
  { numero: 6, rotulo: 'Sábado', curto: 'Sáb' },
]

/** Uma linha da grade horária enquanto está sendo preenchida no formulário. */
export interface DiaGrade {
  ativo: boolean
  inicio: string
  fim: string
}

export function badgeSituacaoMotorista(situacao: SituacaoMotorista): EstiloBadge {
  switch (situacao) {
    case 'ativo':
      return { rotulo: 'ATIVO', ...VERDE }
    case 'ferias':
      return { rotulo: 'FÉRIAS', ...AMBAR }
    case 'afastado':
      return { rotulo: 'AFASTADO', ...VERMELHO }
    default:
      return { rotulo: 'INATIVO', ...NEUTRO }
  }
}

export function badgeSolicitacaoVolta(status: SolicitacaoStatus): EstiloBadge {
  switch (status) {
    case 'aprovada':
      return { rotulo: 'Aprovada', ...VERDE }
    case 'recusada':
      return { rotulo: 'Recusada', ...VERMELHO }
    case 'cancelada':
      return { rotulo: 'Cancelada', ...NEUTRO }
    default:
      return { rotulo: 'Aguardando', ...AMBAR }
  }
}

/**
 * Cores da situação operacional da rota. Estava duplicada literalmente em
 * Dashboard, MinhaRota e MinhasRotas — aqui fica a única definição.
 */
export function badgeSituacaoOperacional(situacao: SituacaoOperacional): EstiloBadge {
  switch (situacao) {
    case 'em_rota':
      return { rotulo: 'Em rota', ...VERDE }
    case 'concluida':
      return { rotulo: 'Concluída', ...NEUTRO }
    default:
      return { rotulo: 'Aguardando', ...AMBAR }
  }
}

/**
 * Alerta de vencimento: quantos dias faltam para a data, ou null quando
 * não há data. Usado por CNH, exame toxicológico, ASO e apólice.
 */
export function diasParaVencer(data: string | null): number | null {
  if (!data) return null
  const alvo = new Date(`${data}T00:00:00`)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}
