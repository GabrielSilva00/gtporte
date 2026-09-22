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
  /** Motivo escolhido ao abrir a conversa direta. */
  assunto: string | null
  rota_id: string | null
  ultima_em: string
  ultima_msg: string | null
  participantes: number
}

export interface MensagemConversa {
  id: string
  autor_id: string | null
  autor_nome: string | null
  /** perfil.tipo de quem escreveu: estudante, motorista, admin, operador. */
  autor_tipo: string | null
  eh_bot: boolean
  corpo: string
  criado_em: string
}

export interface MotivoConversa {
  id: string
  destino: DestinoConversa
  titulo: string
  descricao: string | null
}

/**
 * Conversas do estudante: os grupos das rotas em que ele viaja e as
 * conversas diretas com a secretaria ou com o motorista. Nao ha chatbot:
 * toda conversa direta comeca com um motivo e fala direto com a pessoa.
 */
export function useConversas() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    // Garante o grupo das rotas antes de listar: o aluno entra no grupo
    // assim que passa a viajar na rota (e o cadastro esta validado).
    await supabase.rpc('garantir_grupos_das_rotas')
    const { data } = await supabase.rpc('minhas_conversas')
    setConversas((data as Conversa[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const abrirDireta = useCallback(
    async (destino: DestinoConversa, motivoId: string, mensagem: string) => {
      const { data, error } = await supabase.rpc('abrir_conversa_direta', {
        p_destino: destino,
        p_motivo_id: motivoId,
        p_mensagem: mensagem.trim(),
      })
      if (error) throw new Error(erroMsg(error))
      const { data: lista } = await supabase.rpc('minhas_conversas')
      const todas = (lista as Conversa[]) ?? []
      setConversas(todas)
      return todas.find((c) => c.id === (data as string)) ?? null
    },
    [],
  )

  const diretas = conversas.filter((c) => c.tipo === 'direta')
  const grupos = conversas.filter((c) => c.tipo === 'grupo')

  return { conversas, diretas, grupos, loading, refresh, abrirDireta }
}

/** Motivos de contato cadastrados pela secretaria, por destino. */
export function useMotivos() {
  const [motivos, setMotivos] = useState<MotivoConversa[]>([])

  useEffect(() => {
    let vivo = true
    supabase
      .from('motivo_conversa')
      .select('id,destino,titulo,descricao')
      .eq('ativo', true)
      .order('ordem')
      .order('titulo')
      .then(({ data }) => {
        if (vivo) setMotivos((data as MotivoConversa[]) ?? [])
      })
    return () => {
      vivo = false
    }
  }, [])

  return motivos
}

/**
 * Mensagens de uma conversa, com envio. Mensagem nova chega pelo
 * Realtime; a consulta a cada 30s cobre o caso de a conexao cair.
 */
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

  useEffect(() => {
    if (!conversaId) return
    // O payload do Realtime nao traz o nome do autor: recarrega pela funcao.
    const canal = supabase
      .channel(`conversa:${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversa_mensagem',
          filter: `conversa_id=eq.${conversaId}`,
        },
        () => refresh(),
      )
      .subscribe()
    const t = setInterval(refresh, 30000)
    return () => {
      clearInterval(t)
      supabase.removeChannel(canal)
    }
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

  const encerrar = useCallback(async () => {
    if (!conversaId) return
    const { error } = await supabase.rpc('encerrar_conversa', { p_conversa_id: conversaId })
    if (error) throw new Error(erroMsg(error))
  }, [conversaId])

  return { msgs, loading, erro, meuId, enviar, encerrar, refresh }
}
