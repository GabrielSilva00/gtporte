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

/**
 * Cliente sem sessão persistida, usado para criar o acesso de um novo
 * funcionário (RF20). O signUp autentica o usuário recém-criado no cliente
 * que o chamou; em um cliente separado isso não derruba a sessão do
 * administrador que está usando o painel.
 */
export const supabaseCadastro = createClient(url || 'http://localhost:54321', anonKey || 'anon', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

export const BUCKET_DOCUMENTOS = 'documentos'

/** Domínio sintético para acessos criados sem e-mail real — só identifica o login. */
export const DOMINIO_LOGIN = 'gtporte.local'

/** O Supabase Auth exige um e-mail; sem um real, derivamos do login. */
export function emailDeAcesso(login: string, email?: string | null): string {
  const informado = email?.trim()
  if (informado) return informado
  return `${login.trim().toLowerCase()}@${DOMINIO_LOGIN}`
}

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
