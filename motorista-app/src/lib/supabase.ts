import { createClient } from '@supabase/supabase-js'
import { marcarFim, marcarInicio } from './conexao'

const url = import.meta.env.VITE_SUPABASE_URL || ''; const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
/** Sem isso o cliente cai calado no localhost e o login falha com um erro de rede sem sentido. */
export const supabaseConfigurado = Boolean(url && key && !url.includes('xxxx'))

/** Alimenta o indicador de conexao: toda chamada ao Supabase passa por aqui. */
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

export const supabase = createClient(url||'http://localhost:54321', key||'anon', {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  global:{fetch:fetchInstrumentado},
})

/**
 * Falha de rede (sem sinal, tempo esgotado) e nao recusa do banco. O
 * supabase-js devolve a falha do fetch como um erro sem codigo, com a
 * mensagem do navegador: "Failed to fetch" (Chrome), "Load failed"
 * (Safari), "NetworkError..." (Firefox).
 */
export function ehFalhaDeRede(e:unknown){
  if(typeof navigator!=='undefined'&&!navigator.onLine) return true
  const err=e as {message?:string;code?:string}|null
  const msg=err?.message??String(e)
  return !err?.code && /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg)
}

export function erroMsg(e:unknown){
  if(!e)return'Erro desconhecido'
  const err=e as{message?:string;code?:string}
  const msg=err.message??String(e)
  if(err.code==='42501'||msg.includes('row-level security'))return'Sem permissão.'
  if(ehFalhaDeRede(e))return'Sem conexão. Verifique a internet.'
  return msg.replace(/^.*?ERROR:\s*/i,'')
}

/**
 * Id do usuario logado lido da sessao salva no aparelho. getUser() vai ao
 * servidor a cada chamada: sem rede ele falha e o app achava que nao havia
 * ninguem logado. Quem garante o acesso continua sendo a RLS no banco.
 */
export async function meuUsuarioId():Promise<string|null>{
  const {data:{session}}=await supabase.auth.getSession()
  return session?.user.id??null
}
