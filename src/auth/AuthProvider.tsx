import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { ChavePagina } from '../lib/paginas'
import type { Perfil } from '../lib/types'

interface AuthContexto {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  /** admin ou operador — quem pode acessar o painel administrativo */
  ehStaff: boolean
  /** apenas admin — RN06 (rotas) e RN07 (documentos) */
  ehAdmin: boolean
  /** id em public.estudante quando o perfil é estudante (null se ainda não completou o cadastro) */
  estudanteId: string | null
  /** id em public.motorista quando o perfil é motorista */
  motoristaId: string | null
  /** Páginas do painel administrativo liberadas para este usuário (RF20) */
  permissoes: ChavePagina[]
  /** Atalho de leitura sobre `permissoes` — admin sempre recebe true */
  podeAcessar: (pagina: ChavePagina) => boolean
  /** Autentica e devolve o tipo gravado em public.perfil, para a tela de login conferir
   *  se corresponde ao público escolhido no formulário. */
  entrar: (email: string, senha: string) => Promise<Perfil['tipo'] | null>
  sair: () => Promise<void>
  /** Recarrega perfil e vínculos — usado após completar o cadastro de estudante */
  recarregar: () => Promise<void>
}

const Ctx = createContext<AuthContexto | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [estudanteId, setEstudanteId] = useState<string | null>(null)
  const [motoristaId, setMotoristaId] = useState<string | null>(null)
  const [permissoes, setPermissoes] = useState<ChavePagina[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregarPerfil = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('perfil').select('*').eq('id', userId).single()
    if (error || !data) {
      setPerfil(null)
      setEstudanteId(null)
      setMotoristaId(null)
      setPermissoes([])
      return
    }

    const p = data as Perfil
    setPerfil(p)

    // Páginas liberadas (RF20). A função do banco já devolve tudo para o admin.
    if (p.tipo === 'admin' || p.tipo === 'operador') {
      const { data: paginas } = await supabase.rpc('minhas_paginas')
      setPermissoes((paginas as ChavePagina[] | null) ?? [])
    } else {
      setPermissoes([])
    }

    // Vínculo com o registro operacional correspondente ao perfil
    if (p.tipo === 'estudante') {
      const { data: est } = await supabase
        .from('estudante')
        .select('id')
        .eq('perfil_id', userId)
        .maybeSingle()
      setEstudanteId(est?.id ?? null)
      setMotoristaId(null)
    } else if (p.tipo === 'motorista') {
      const { data: mot } = await supabase
        .from('motorista')
        .select('id')
        .eq('perfil_id', userId)
        .maybeSingle()
      setMotoristaId(mot?.id ?? null)
      setEstudanteId(null)
    } else {
      setEstudanteId(null)
      setMotoristaId(null)
    }
  }, [])

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSessao(data.session)
      if (data.session?.user) await carregarPerfil(data.session.user.id)
      if (ativo) setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, novaSessao) => {
      if (!ativo) return
      setSessao(novaSessao)
      if (novaSessao?.user) {
        await carregarPerfil(novaSessao.user.id)
      } else {
        setPerfil(null)
        setEstudanteId(null)
        setMotoristaId(null)
        setPermissoes([])
      }
      setCarregando(false)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [carregarPerfil])

  const entrar = useCallback(async (email: string, senha: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    if (!data.user) return null

    // Registra o último acesso (coluna usada na tela Funcionários)
    await supabase.from('perfil').update({ ultimo_acesso: new Date().toISOString() }).eq('id', data.user.id)

    const { data: p } = await supabase.from('perfil').select('tipo').eq('id', data.user.id).maybeSingle()
    return (p?.tipo as Perfil['tipo']) ?? null
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setSessao(null)
    setEstudanteId(null)
    setMotoristaId(null)
    setPermissoes([])
  }, [])

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) await carregarPerfil(data.session.user.id)
  }, [carregarPerfil])

  const valor = useMemo<AuthContexto>(() => {
    const ehAdmin = perfil?.tipo === 'admin'
    return {
      sessao,
      perfil,
      carregando,
      ehStaff: ehAdmin || perfil?.tipo === 'operador',
      ehAdmin,
      estudanteId,
      motoristaId,
      permissoes,
      podeAcessar: (pagina) => ehAdmin || permissoes.includes(pagina),
      entrar,
      sair,
      recarregar,
    }
  }, [sessao, perfil, carregando, estudanteId, motoristaId, permissoes, entrar, sair, recarregar])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): AuthContexto {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

/** Rota inicial de cada perfil após o login (RF21). */
export function rotaInicial(tipo: Perfil['tipo'] | undefined): string {
  switch (tipo) {
    case 'admin':
    case 'operador':
      return '/'
    case 'motorista':
      return '/motorista'
    case 'estudante':
      return '/estudante'
    default:
      return '/login'
  }
}
