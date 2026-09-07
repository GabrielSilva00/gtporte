import { describe, expect, it } from 'vitest'
import { combina, normalizar, prontuarioDoQR } from './qr'

describe('prontuarioDoQR', () => {
  it('devolve o código quando o QR carrega só o prontuário', () => {
    expect(prontuarioDoQR('218926')).toBe('218926')
  })

  it('ignora espaços em volta do código', () => {
    expect(prontuarioDoQR('  218926 ')).toBe('218926')
  })

  it('extrai o prontuário de um QR que embute uma URL', () => {
    expect(prontuarioDoQR('https://gtporte.app/aluno/218926')).toBe('218926')
  })

  it('escolhe a maior sequência de dígitos quando há mais de uma', () => {
    expect(prontuarioDoQR('v2 aluno 218926')).toBe('218926')
  })

  it('devolve o texto lido quando não há número nenhum', () => {
    expect(prontuarioDoQR('sem codigo')).toBe('sem codigo')
  })
})

describe('normalizar', () => {
  it('remove acentos e baixa a caixa', () => {
    expect(normalizar('José Antônio')).toBe('jose antonio')
  })
})

describe('combina', () => {
  const nome = 'José Antônio da Silva'
  const prontuario = '218926'

  it('encontra o aluno pelo prontuário exato', () => {
    expect(combina('218926', nome, prontuario)).toBe(true)
  })

  it('encontra o aluno por parte do nome sem acento', () => {
    expect(combina('jose', nome, prontuario)).toBe(true)
  })

  it('encontra o aluno por parte do prontuário', () => {
    expect(combina('8926', nome, prontuario)).toBe(true)
  })

  it('não confunde com outro aluno', () => {
    expect(combina('maria', nome, prontuario)).toBe(false)
  })

  it('com a busca vazia mantém todos na lista', () => {
    expect(combina('   ', nome, prontuario)).toBe(true)
  })
})
