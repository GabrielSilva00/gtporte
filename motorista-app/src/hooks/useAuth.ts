import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export interface Perfil { id:string; nome:string; tipo:string; login:string|null }

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
    const email = id.includes('@') ? id.trim() : `${id.trim().toLowerCase()}@gtporte.local`
    const {error} = await supabase.auth.signInWithPassword({email,password:senha})
    if(error) throw new Error(error.message==='Invalid login credentials'?'Login ou senha incorretos.':error.message)
  }

  async function logout() { await supabase.auth.signOut(); setPerfil(null); setSession(null) }

  return { session, perfil, loading, isMotorista: perfil?.tipo==='motorista', login, logout }
}
