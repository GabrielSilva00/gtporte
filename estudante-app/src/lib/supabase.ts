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

export function erroMsg(e: unknown) {
  if (!e) return 'Erro desconhecido'
  const err = e as { message?: string; code?: string }
  const msg = err.message ?? String(e)
  if (err.code === '42501' || msg.includes('row-level security')) return 'Sem permissão.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão. Verifique sua internet.'
  return msg.replace(/^.*?ERROR:\s*/i, '')
}
