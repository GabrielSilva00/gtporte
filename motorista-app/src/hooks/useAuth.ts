import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export interface Perfil { id:string; nome:string; tipo:string; login:string|null }

/** Dominio sintetico dos acessos criados sem e-mail real (ver src/lib/supabase.ts da raiz). */
const DOMINIO_LOGIN = 'gtporte.local'

/**
 * O acesso do motorista e criado com login e senha, e o Supabase Auth autentica
 * por e-mail. Quem sabe qual e-mail ficou gravado e o banco: email_do_login() e
 * security definer e liberada para anon justamente por rodar antes do login.
 * Adivinhar o dominio aqui quebra todo acesso criado com e-mail informado.
 */
async function resolverEmail(identificador:string):Promise<string> {
  const valor = identificador.trim()
  if (valor.includes('@')) return valor
  const login = valor.toLowerCase()
  const {data} = await supabase.rpc('email_do_login', {p_login: login})
  if (data) return data as string
  // Acessos antigos, criados sem e-mail: o endereco deriva do proprio login.
  return `${login}@${DOMINIO_LOGIN}`
}

export function useAuth() {
  const [session, setSession] = useState<Session|null>(null)
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => { setSession(data.session); if(data.session) fetchPerfil(data.session.user.id); else setLoading(false) })
    const { data:{subscription} } = supabase.auth.onAuthStateChange((_,s) => { setSession(s); if(s) fetchPerfil(s.user.id); else { setPerfil(null); setLoading(false) }})
    return () => subscription.unsubscribe()
  }, [])

  async function fetchPerfil(uid:string) {
    const {data} = await supabase.from('perfil').select('id,nome,tipo,login').eq('id',uid).maybeSingle()
    setPerfil(data); setLoading(false)
  }

  async function login(id:string, senha:string) {
    const email = await resolverEmail(id)
    const {error} = await supabase.auth.signInWithPassword({email,password:senha})
    if(error) throw new Error(error.message==='Invalid login credentials'?'Login ou senha incorretos.':error.message)
  }

  async function logout() { await supabase.auth.signOut(); setPerfil(null); setSession(null) }

  return { session, perfil, loading, isMotorista: perfil?.tipo==='motorista', login, logout }
}
