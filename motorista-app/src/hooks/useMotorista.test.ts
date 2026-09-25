import { describe, expect, it } from 'vitest'
import { aplicarFila, diaDaSemana, hoje, resumirTrecho, type LinhaViagem } from './useMotorista'

const linha = (nome: string, extra: Partial<LinhaViagem> = {}): LinhaViagem => ({
  estudante_id: nome, nome, prontuario: '1', perfil_uso: 'ida_volta',
  confirmou_ida: false, confirmou_volta: false,
  checkin_aluno_ida_em: null, checkin_aluno_volta_em: null,
  embarque_ida_em: null, embarque_volta_em: null,
  hora_ida: null, hora_volta: null,
  cancelou_ida: false, cancelou_volta: false,
  motivo_cancelamento_ida: null, motivo_cancelamento_volta: null,
  ...extra,
})

describe('resumirTrecho', () => {
  const t = '2026-09-25T10:00:00Z'
  const linhas = [
    linha('embarcou', { confirmou_ida: true, checkin_aluno_ida_em: t, embarque_ida_em: t }),
    linha('so-app', { confirmou_ida: true, checkin_aluno_ida_em: t }),
    linha('secretaria', { confirmou_ida: true }),
    linha('cancelou', { cancelou_ida: true, motivo_cancelamento_ida: 'doente' }),
  ]

  it('separa quem foi, quem so confirmou no app e quem cancelou', () => {
    const r = resumirTrecho(linhas, 'ida')
    expect(r.foram.map((l) => l.nome)).toEqual(['embarcou', 'secretaria'])
    expect(r.semEmbarque.map((l) => l.nome)).toEqual(['so-app'])
    expect(r.cancelaram.map((l) => l.nome)).toEqual(['cancelou'])
    expect(r.conferido).toBe(true)
  })

  it('sem nenhum embarque registrado o trecho nao foi conferido', () => {
    expect(resumirTrecho(linhas, 'volta').conferido).toBe(false)
  })
})

describe('aplicarFila', () => {
  const base = {
    alocacao_id: 'a', estudante_id: 'e', nome: 'Ana', prontuario: '1', curso: null, universidade: null, perfil_uso: 'ida_volta',
    confirmou_ida: true, hora_ida: null, confirmou_volta: false, hora_volta: null,
    embarcou_ida: false, embarcou_volta: false, checkin_aluno_ida: true, checkin_aluno_volta: false,
    cancelou_ida: false, cancelou_volta: false,
  }

  it('embarque guardado offline aparece marcado e pendente', () => {
    const [p] = aplicarFila([base], [{ tipo: 'confirmar', estudanteId: 'e', nome: 'Ana', trecho: 'ida', data: hoje() }])
    expect(p.embarcou_ida).toBe(true)
    expect(p.pendente_ida).toBe(true)
    expect(p.pendente_volta).toBe(false)
  })

  it('desfazer mantem a confirmacao que o aluno fez no app', () => {
    const [p] = aplicarFila([{ ...base, embarcou_ida: true }], [{ tipo: 'desfazer', estudanteId: 'e', nome: 'Ana', trecho: 'ida', data: hoje() }])
    expect(p.embarcou_ida).toBe(false)
    expect(p.confirmou_ida).toBe(true)
  })

  it('operacao de outro dia nao afeta a lista de hoje', () => {
    const [p] = aplicarFila([base], [{ tipo: 'confirmar', estudanteId: 'e', nome: 'Ana', trecho: 'ida', data: '2000-01-01' }])
    expect(p.embarcou_ida).toBe(false)
  })
})

describe('diaDaSemana', () => {
  it('usa o calendario local (0 = domingo)', () => {
    expect(diaDaSemana('2026-09-27')).toBe(0)
    expect(diaDaSemana('2026-09-28')).toBe(1)
  })
})
