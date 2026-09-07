import { describe, expect, it } from 'vitest'
import { corAvatar, corOcupacao, dataBR, diasParaVencer, hora, iniciais, percentual } from './format'

describe('iniciais', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciais('José Antônio da Silva')).toBe('JS')
  })

  it('usa as duas primeiras letras quando há um nome só', () => {
    expect(iniciais('Gabriel')).toBe('GA')
  })

  it('ignora espaços sobrando', () => {
    expect(iniciais('  Ana   Souza  ')).toBe('AS')
  })

  it('devolve ? para nome vazio', () => {
    expect(iniciais('   ')).toBe('?')
  })
})

describe('corAvatar', () => {
  it('devolve sempre a mesma cor para o mesmo nome', () => {
    expect(corAvatar('Ana Souza')).toBe(corAvatar('Ana Souza'))
  })

  it('devolve uma cor da paleta', () => {
    const paleta = ['#1F3A2E', '#8A5A15', '#9E3E3E', '#2E7D5A', '#C4633A']
    expect(paleta).toContain(corAvatar('Qualquer Nome'))
  })
})

describe('hora', () => {
  it('corta os segundos', () => {
    expect(hora('05:40:00')).toBe('05:40')
  })

  it('marca o vazio com travessão', () => {
    expect(hora(null)).toBe('—')
  })
})

describe('dataBR', () => {
  it('formata uma data ISO no padrão brasileiro', () => {
    expect(dataBR('2026-03-15')).toBe('15/03/2026')
  })

  it('marca o vazio com travessão', () => {
    expect(dataBR(undefined)).toBe('—')
  })
})

describe('percentual', () => {
  it('calcula a ocupação arredondada', () => {
    expect(percentual(15, 40)).toBe(38)
  })

  it('devolve 0 quando não há capacidade, sem dividir por zero', () => {
    expect(percentual(5, 0)).toBe(0)
  })
})

describe('corOcupacao', () => {
  it('fica verde até 75%', () => {
    expect(corOcupacao(75)).toBe('#2E7D5A')
  })

  it('fica âmbar a partir de 76%', () => {
    expect(corOcupacao(76)).toBe('#B8862B')
  })

  it('fica vermelho a partir de 95%', () => {
    expect(corOcupacao(95)).toBe('#9E3E3E')
  })
})

describe('diasParaVencer', () => {
  it('conta os dias que faltam até a data', () => {
    const daqui10 = new Date()
    daqui10.setDate(daqui10.getDate() + 10)
    expect(diasParaVencer(daqui10.toLocaleDateString('sv-SE'))).toBe(10)
  })

  it('devolve negativo para documento vencido', () => {
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    expect(diasParaVencer(ontem.toLocaleDateString('sv-SE'))).toBe(-1)
  })

  it('devolve null quando não há validade', () => {
    expect(diasParaVencer(null)).toBeNull()
  })
})
