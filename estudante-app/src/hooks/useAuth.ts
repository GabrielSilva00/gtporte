import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export interface Perfil { id:string; nome:string; tipo:string; login:string|null; telefone?:string|null }

export function useAuth() {
  const [session, setSession] = useState<Session|null>(null)
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [estudanteId, setEstudanteId] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPerfil = useCallback(async(uid:string)=>{
    const {data}=await supabase.from('perfil').select('id,nome,tipo,login,telefone').eq('id',uid).maybeSingle()
    setPerfil(data)
    if(data?.tipo==='estudante'){
      const {data:est}=await supabase.from('estudante').select('id').eq('perfil_id',uid).maybeSingle()
      setEstudanteId(est?.id??null)
    }
    setLoading(false)
  },[])

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session)fetchPerfil(data.session.user.id);else setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{setSession(s);if(s)fetchPerfil(s.user.id);else{setPerfil(null);setEstudanteId(null);setLoading(false)}})
    return ()=>subscription.unsubscribe()
  },[fetchPerfil])

  const login=async(email:string,senha:string)=>{
    const {error}=await supabase.auth.signInWithPassword({email,password:senha})
    if(error)throw new Error(error.message==='Invalid login credentials'?'E-mail ou senha incorretos.':error.message)
  }

  const cadastrar=async(nome:string,email:string,telefone:string,senha:string)=>{
    const {data,error}=await supabase.auth.signUp({email:email.trim(),password:senha,options:{data:{nome:nome.trim(),telefone:telefone.trim()||null,tipo:'estudante'}}})
    if(error) throw new Error(error.message.includes('already registered')?'Ja existe uma conta com este e-mail.':error.message)
    return data
  }

  const logout=async()=>{await supabase.auth.signOut();setPerfil(null);setSession(null);setEstudanteId(null)}
  const recarregar=async()=>{const{data}=await supabase.auth.getSession();if(data.session?.user)await fetchPerfil(data.session.user.id)}

  return { session, perfil, estudanteId, loading, isEstudante:perfil?.tipo==='estudante', cadastroCompleto:!!estudanteId, login, cadastrar, logout, recarregar }
}
