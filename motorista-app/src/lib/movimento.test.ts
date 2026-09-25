import { describe, expect, it } from 'vitest'
import { avaliarLeitura, distanciaM, ESTADO_INICIAL, situacaoSugerida, type EstadoMovimento, type Leitura, type Movimento } from './movimento'

// ~0.0009 grau de latitude = 100 m
const pt = (metrosNorte: number, segundos: number, extra: Partial<Leitura> = {}): Leitura =>
  ({ lat: -21.2 + metrosNorte * 0.000009, lng: -50.44, t: segundos * 1000, precisao: 10, ...extra })

function rodar(leituras: Leitura[]): Movimento[] {
  let e: EstadoMovimento = ESTADO_INICIAL
  return leituras.map((l) => {
    const r = avaliarLeitura(e, l)
    e = r.estado
    return r.movimento
  })
}

describe('distanciaM', () => {
  it('mede ~100 m', () => {
    expect(distanciaM(pt(0, 0), pt(100, 0))).toBeGreaterThan(95)
    expect(distanciaM(pt(0, 0), pt(100, 0))).toBeLessThan(105)
  })
})

describe('avaliarLeitura', () => {
  it('parado por 5 minutos no mesmo lugar', () => {
    const r = rodar([pt(0, 0), pt(10, 60), pt(5, 180), pt(12, 301)])
    expect(r[r.length - 1]).toBe('parado')
    expect(r.slice(0, 3)).not.toContain('parado')
  })

  it('parada curta (semaforo) nao conta', () => {
    expect(rodar([pt(0, 0), pt(5, 60), pt(8, 120)])).not.toContain('parado')
  })

  it('andando precisa de duas leituras seguidas', () => {
    const r = rodar([pt(0, 0), pt(200, 15), pt(400, 30)])
    expect(r).toEqual(['indefinido', 'indefinido', 'movendo'])
  })

  it('um salto isolado do sinal nao vira movimento', () => {
    const r = rodar([pt(0, 0), pt(300, 15), pt(300, 30), pt(305, 45)])
    expect(r).not.toContain('movendo')
  })

  it('velocidade informada pelo GPS conta como andando', () => {
    const r = rodar([pt(0, 0), pt(40, 5, { velocidade: 8 }), pt(80, 10, { velocidade: 8 })])
    expect(r[r.length - 1]).toBe('movendo')
  })

  it('leitura imprecisa e ignorada', () => {
    const r = rodar([pt(0, 0), pt(500, 15, { precisao: 300 }), pt(900, 30, { precisao: 300 })])
    expect(r).not.toContain('movendo')
  })
})

describe('situacaoSugerida', () => {
  it('aguardando -> em rota ao andar; em rota -> aguardando parado; concluida fica', () => {
    expect(situacaoSugerida('aguardando', 'movendo')).toBe('em_rota')
    expect(situacaoSugerida('em_rota', 'parado')).toBe('aguardando')
    expect(situacaoSugerida('em_rota', 'movendo')).toBeNull()
    expect(situacaoSugerida('concluida', 'movendo')).toBeNull()
  })
})
