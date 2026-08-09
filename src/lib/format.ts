import type {
  SituacaoAlocacao,
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
