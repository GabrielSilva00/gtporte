import { describe, expect, it } from 'vitest'
import { caminhoArquivoMotorista, emailDeAcesso, mensagemErro } from './supabase'

describe('emailDeAcesso', () => {
  it('usa o e-mail informado quando existe', () => {
    expect(emailDeAcesso('joao', 'joao@prefeitura.sp.gov.br')).toBe('joao@prefeitura.sp.gov.br')
  })

  it('deriva do login quando não há e-mail', () => {
    expect(emailDeAcesso('Joao')).toBe('joao@gtporte.local')
  })

  it('trata e-mail em branco como ausente', () => {
    expect(emailDeAcesso('joao', '   ')).toBe('joao@gtporte.local')
  })
})

describe('mensagemErro', () => {
  it('explica a violação de campo único', () => {
    expect(mensagemErro({ code: '23505' })).toContain('Já existe')
  })

  it('explica o bloqueio da RLS em português', () => {
    expect(mensagemErro({ code: '42501' })).toBe('Seu perfil não tem permissão para esta ação.')
  })

  it('limpa o prefixo do Postgres da mensagem', () => {
    expect(mensagemErro({ message: 'ERROR: Prazo para confirmacao encerrado' })).toBe(
      'Prazo para confirmacao encerrado',
    )
  })

  it('não quebra com erro nulo', () => {
    expect(mensagemErro(null)).toBe('Erro desconhecido')
  })
})

describe('caminhoArquivoMotorista', () => {
  it('põe o id do motorista na segunda pasta, que é o que a policy verifica', () => {
    const arquivo = new File([''], 'cnh.pdf')
    const caminho = caminhoArquivoMotorista('abc-123', 'cnh_frente', arquivo)
    expect(caminho.split('/')[0]).toBe('motorista')
    expect(caminho.split('/')[1]).toBe('abc-123')
    expect(caminho.endsWith('.pdf')).toBe(true)
  })
})
