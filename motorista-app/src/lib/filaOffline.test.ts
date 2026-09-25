import { beforeEach, describe, expect, it } from 'vitest'
import { enfileirar, itensDaFila, juntar, limparFila, sincronizar, type ItemFila, type Operacao, type Resultado } from './filaOffline'

const item = (op: Operacao, id = Math.random().toString()): ItemFila => ({ id, criadoEm: 0, op })
const confirmar = (estudanteId: string, trecho: 'ida' | 'volta' = 'ida'): Operacao =>
  ({ tipo: 'confirmar', estudanteId, nome: estudanteId, trecho, data: '2026-09-25' })
const desfazer = (estudanteId: string, trecho: 'ida' | 'volta' = 'ida'): Operacao =>
  ({ tipo: 'desfazer', estudanteId, nome: estudanteId, trecho, data: '2026-09-25' })

describe('juntar', () => {
  it('confirmar e desfazer do mesmo aluno se anulam', () => {
    const fila = juntar([], item(confirmar('a')))
    expect(juntar(fila, item(desfazer('a')))).toEqual([])
  })

  it('trechos diferentes nao se misturam', () => {
    const fila = juntar([], item(confirmar('a', 'ida')))
    expect(juntar(fila, item(desfazer('a', 'volta')))).toHaveLength(2)
  })

  it('confirmar repetido fica uma vez so', () => {
    const fila = juntar([], item(confirmar('a'), '1'))
    expect(juntar(fila, item(confirmar('a'), '2')).map((i) => i.id)).toEqual(['1'])
  })

  it('situacao da viagem vale a ultima', () => {
    let fila = juntar([], item({ tipo: 'situacao', rotaId: 'r', situacao: 'em_rota' }))
    fila = juntar(fila, item({ tipo: 'situacao', rotaId: 'r', situacao: 'aguardando' }))
    expect(fila).toHaveLength(1)
    expect(fila[0].op).toMatchObject({ situacao: 'aguardando' })
  })
})

describe('sincronizar', () => {
  beforeEach(() => limparFila())

  it('para no erro de rede e descarta o que o banco recusou', async () => {
    enfileirar(confirmar('a'))
    enfileirar(confirmar('b'))
    enfileirar(confirmar('c'))
    const recusadas: string[] = []
    const respostas: Record<string, Resultado> = {
      a: { ok: true },
      b: { ok: false, motivo: 'recusada', mensagem: 'sem vaga' },
      c: { ok: false, motivo: 'rede' },
    }
    const enviados = await sincronizar(
      async (op) => respostas[(op as { estudanteId: string }).estudanteId],
      (op, msg) => recusadas.push(`${(op as { estudanteId: string }).estudanteId}:${msg}`),
    )
    expect(enviados).toBe(1)
    expect(recusadas).toEqual(['b:sem vaga'])
    expect(itensDaFila().map((i) => (i.op as { estudanteId: string }).estudanteId)).toEqual(['c'])
  })
})
