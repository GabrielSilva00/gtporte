import { useCallback, useEffect, useState } from 'react'
import { erroMsg, supabase } from '@/lib/supabase'

export type TipoConversa = 'direta' | 'grupo'
export type DestinoConversa = 'secretaria' | 'motorista'
export type SituacaoConversa = 'bot' | 'humano' | 'encerrada'

export interface Conversa {
  id: string
  tipo: TipoConversa
  destino: DestinoConversa | null
  situacao: SituacaoConversa
  titulo: string
  subtitulo: string | null
  rota_id: string | null
  ultima_em: string
  ultima_msg: string | null
  participantes: number
}

export interface MensagemConversa {
  id: string
  autor_id: string | null
  autor_nome: string | null
  autor_tipo: string | null
  eh_bot: boolean
  corpo: string
  criado_em: string
}

/**
 * Conversas do estudante: os grupos das rotas em que ele viaja e as
 * conversas diretas ja abertas com a secretaria ou com o motorista.
 */
export function useConversas() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // Garante o grupo das rotas antes de listar: o aluno entra no grupo
    // assim que passa a viajar na rota.
    await supabase.rpc('garantir_grupos_das_rotas')
    const { data } = await supabase.rpc('minhas_conversas')
    setConversas((data as Conversa[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const abrirDireta = useCallback(
    async (destino: DestinoConversa) => {
      const { data, error } = await supabase.rpc('abrir_conversa_direta', { p_destino: destino })
      if (error) throw new Error(erroMsg(error))
      await refresh()
      return data as string
    },
    [refresh],
  )

  const diretas = conversas.filter((c) => c.tipo === 'direta')
  const grupos = conversas.filter((c) => c.tipo === 'grupo')

  return { conversas, diretas, grupos, loading, refresh, abrirDireta }
}

/** Mensagens de uma conversa, com envio. */
export function useMensagensConversa(conversaId: string | null) {
  const [msgs, setMsgs] = useState<MensagemConversa[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!conversaId) {
      setMsgs([])
      setLoading(false)
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    setMeuId(user?.id ?? null)

    // Pela funcao, e nao por embed em `perfil`: a policy
    // perfil_select_proprio deixa o estudante ver apenas o proprio
    // perfil, entao o nome dos outros participantes vinha vazio.
    const { data, error } = await supabase.rpc('mensagens_da_conversa', {
      p_conversa_id: conversaId,
    })
    if (error) {
      setErro(erroMsg(error))
      setMsgs([])
    } else {
      setErro(null)
      setMsgs((data as MensagemConversa[]) ?? [])
    }
    setLoading(false)
  }, [conversaId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Sem realtime configurado: a conversa aberta recarrega a cada 10s.
  useEffect(() => {
    if (!conversaId) return
    const t = setInterval(refresh, 10000)
    return () => clearInterval(t)
  }, [conversaId, refresh])

  const enviar = useCallback(
    async (corpo: string) => {
      if (!conversaId || !corpo.trim()) return
      const { error } = await supabase.rpc('enviar_mensagem_conversa', {
        p_conversa_id: conversaId,
        p_corpo: corpo.trim(),
      })
      if (error) throw new Error(erroMsg(error))
      await refresh()
    },
    [conversaId, refresh],
  )

  const escalar = useCallback(async () => {
    if (!conversaId) return
    const { error } = await supabase.rpc('escalar_conversa', { p_conversa_id: conversaId })
    if (error) throw new Error(erroMsg(error))
    await refresh()
  }, [conversaId, refresh])

  return { msgs, loading, erro, meuId, enviar, escalar, refresh }
}
