import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Indica se o .env foi preenchido. Quando falso, App.tsx exibe a tela de
 * configuração em vez de deixar a aplicação quebrar em tela branca.
 */
export const supabaseConfigurado = Boolean(url && anonKey && !url.includes('xxxx'))

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const BUCKET_DOCUMENTOS = 'documentos'

/** Converte erros do PostgREST/PL-pgSQL em mensagens legíveis para o usuário. */
export function mensagemErro(erro: unknown): string {
  if (!erro) return 'Erro desconhecido'
  const e = erro as { message?: string; details?: string; code?: string }
  const msg = e.message ?? String(erro)

  if (e.code === '23505') return 'Já existe um registro com esse valor único (placa, CNH, CPF ou código).'
  if (e.code === '23503') return 'Registro vinculado a outros dados — remova os vínculos antes de excluir.'
  if (e.code === '42501' || msg.includes('row-level security')) {
    return 'Seu perfil não tem permissão para esta ação.'
  }
  return msg.replace(/^.*?ERROR:\s*/i, '')
}
