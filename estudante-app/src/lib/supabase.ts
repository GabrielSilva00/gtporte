import { createClient } from '@supabase/supabase-js'
import { marcarFim, marcarInicio } from './conexao'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

/**
 * Envolve o fetch do cliente para alimentar o indicador de sincronizacao.
 * Toda chamada ao Supabase passa por aqui, inclusive as internas do auth.
 */
const fetchInstrumentado: typeof fetch = async (entrada, init) => {
  marcarInicio()
  try {
    const resposta = await fetch(entrada, init)
    marcarFim(resposta.ok || resposta.status < 500)
    return resposta
  } catch (e) {
    marcarFim(false)
    throw e
  }
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: fetchInstrumentado },
})

/**
 * Traduz o erro do banco para algo acionavel. Violacao de unique (23505)
 * chegava crua na tela como "duplicate key value violates unique
 * constraint ...", que nao diz ao estudante o que fazer.
 */
export function erroMsg(e: unknown) {
  if (!e) return 'Erro desconhecido'
  const err = e as { message?: string; code?: string; details?: string }
  const msg = err.message ?? String(e)
  const contexto = `${msg} ${err.details ?? ''}`

  if (err.code === '42501' || msg.includes('row-level security')) return 'Sem permissão.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão. Verifique sua internet.'

  if (err.code === '23505' || contexto.includes('duplicate key')) {
    if (contexto.includes('cpf')) return 'Este CPF já está cadastrado.'
    if (contexto.includes('perfil_id')) return 'Esta conta já tem um cadastro de estudante.'
    if (contexto.includes('prontuario')) return 'Falha ao gerar o prontuário. Tente novamente.'
    if (contexto.includes('email')) return 'Este e-mail já está em uso.'
    return 'Já existe um cadastro com esses dados.'
  }

  // Campo obrigatorio vazio e violacao de check chegam igualmente cruas.
  if (err.code === '23502') return 'Preencha todos os campos obrigatórios.'
  if (err.code === '23514') return 'Algum campo está fora do formato esperado.'
  if (err.code === '23503') return 'Selecione uma cidade e uma universidade válidas.'

  return msg.replace(/^.*?ERROR:\s*/i, '')
}
