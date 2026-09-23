import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useComunicados } from '@/hooks/useComunicados'
import { useDocumentos, ROTULO_DOC, type Documento } from '@/hooks/useEstudante'
import { useAlteracoes } from '@/hooks/useAlteracoes'
import { SECOES, type Tab } from '@/lib/navegacao'
import { mostrarNoAparelho } from '@/lib/push'

/** Linha de `notificacao` (0027): gerada pelos gatilhos do banco. */
interface NotificacaoBanco {
  id: string
  tipo: string
  titulo: string
  corpo: string
  destino: string | null
  urgente: boolean
  lida_em: string | null
  criado_em: string
}

const TIPOS: TipoNotificacao[] = ['comunicado', 'documento', 'mensagem', 'cadastro', 'onibus']
const ABAS = SECOES.map((s) => s.id) as readonly string[]

export type TipoNotificacao = 'comunicado' | 'documento' | 'mensagem' | 'cadastro' | 'onibus'

export interface Notificacao {
  id: string
  tipo: TipoNotificacao
  titulo: string
  detalhe: string
  quando: string
  /** Aba que resolve o assunto, quando existe uma. */
  destino?: Tab
  urgente?: boolean
}

const CHAVE_LIDAS = 'gtporte:notificacoes-lidas'

function lerLidas(): Set<string> {
  try {
    const v = localStorage.getItem(CHAVE_LIDAS)
    return new Set(v ? (JSON.parse(v) as string[]) : [])
  } catch {
    return new Set()
  }
}

/**
 * Junta num lugar so tudo que pede atencao do estudante: avisos da
 * secretaria, documento recusado, resposta da secretaria ou do motorista
 * e alteracao cadastral revisada.
 *
 * As notificacoes da tabela `notificacao` (validacao do cadastro,
 * respostas, onibus proximo) chegam em tempo real pelo Realtime e guardam
 * a leitura no banco. As demais fontes guardam o "lido" por aparelho
 * (localStorage).
 */
export function useNotificacoes(estudanteId: string | null) {
  const { comunicados } = useComunicados()
  const { docs } = useDocumentos(estudanteId)
  const { itens: alteracoes } = useAlteracoes(estudanteId)
  const [mensagens, setMensagens] = useState<
    { id: string; assunto: string; corpo: string; criado_em: string }[]
  >([])
  const [lidas, setLidas] = useState<Set<string>>(lerLidas)
  const [doBanco, setDoBanco] = useState<NotificacaoBanco[]>([])

  // Notificacoes geradas no banco + assinatura em tempo real.
  useEffect(() => {
    if (!estudanteId) return
    let vivo = true
    let canal: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !vivo) return
      const { data } = await supabase
        .from('notificacao')
        .select('id,tipo,titulo,corpo,destino,urgente,lida_em,criado_em')
        .eq('perfil_id', user.id)
        .order('criado_em', { ascending: false })
        .limit(50)
      if (vivo) setDoBanco((data as NotificacaoBanco[]) ?? [])

      canal = supabase
        .channel(`notificacoes:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notificacao',
            filter: `perfil_id=eq.${user.id}`,
          },
          (payload) => {
            const n = payload.new as NotificacaoBanco
            setDoBanco((lista) => [n, ...lista.filter((x) => x.id !== n.id)])
            mostrarNoAparelho(n.titulo, n.corpo)
          },
        )
        .subscribe()
    })()
    return () => {
      vivo = false
      if (canal) supabase.removeChannel(canal)
    }
  }, [estudanteId])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      // Recebidas: o que a secretaria ou o motorista mandou para este aluno.
      const { data } = await supabase
        .from('mensagem')
        .select('id,assunto,corpo,criado_em')
        .eq('destinatario_id', user.id)
        .order('criado_em', { ascending: false })
        .limit(20)
      if (vivo) setMensagens(data ?? [])
    })()
    return () => {
      vivo = false
    }
  }, [estudanteId])

  const itens = useMemo<Notificacao[]>(() => {
    const lista: Notificacao[] = []

    for (const n of doBanco) {
      lista.push({
        id: `ntf:${n.id}`,
        tipo: TIPOS.includes(n.tipo as TipoNotificacao) ? (n.tipo as TipoNotificacao) : 'comunicado',
        titulo: n.titulo,
        detalhe: n.corpo,
        quando: n.criado_em,
        destino: n.destino && ABAS.includes(n.destino) ? (n.destino as Tab) : undefined,
        urgente: n.urgente,
      })
    }

    for (const c of comunicados) {
      lista.push({
        id: `com:${c.id}`,
        tipo: 'comunicado',
        titulo: c.titulo,
        detalhe: c.corpo,
        quando: c.publicado_em,
        urgente: c.prioridade === 'urgente',
      })
    }

    for (const d of docs as Documento[]) {
      if (d.status !== 'rejeitado') continue
      lista.push({
        id: `doc:${d.id}:${d.criado_em}`,
        tipo: 'documento',
        titulo: `${ROTULO_DOC[d.tipo]} recusado`,
        detalhe: d.observacao ?? 'Reenvie o documento na aba Docs.',
        quando: d.criado_em,
        destino: 'documentos',
        urgente: true,
      })
    }

    for (const m of mensagens) {
      lista.push({
        id: `msg:${m.id}`,
        tipo: 'mensagem',
        titulo: m.assunto,
        detalhe: m.corpo,
        quando: m.criado_em,
        destino: 'feedback',
      })
    }

    for (const a of alteracoes) {
      if (a.status === 'pendente') continue
      lista.push({
        id: `alt:${a.id}:${a.status}`,
        tipo: 'cadastro',
        titulo:
          a.status === 'aprovada' ? 'Alteração cadastral aprovada' : 'Alteração cadastral recusada',
        detalhe: a.observacao ?? `Campo: ${a.campo}`,
        quando: a.criado_em,
        destino: 'perfil',
        urgente: a.status === 'recusada',
      })
    }

    return lista.sort((a, b) => +new Date(b.quando) - +new Date(a.quando))
  }, [doBanco, comunicados, docs, mensagens, alteracoes])

  // As do banco ja lidas (em outro aparelho, inclusive) contam como lidas.
  const lidasTotais = useMemo(() => {
    const t = new Set(lidas)
    for (const n of doBanco) if (n.lida_em) t.add(`ntf:${n.id}`)
    return t
  }, [lidas, doBanco])

  const naoLidas = itens.filter((i) => !lidasTotais.has(i.id))

  const marcarTodasLidas = useCallback(() => {
    const pendentes = doBanco.filter((n) => !n.lida_em).map((n) => n.id)
    if (pendentes.length > 0) {
      const agora = new Date().toISOString()
      supabase
        .from('notificacao')
        .update({ lida_em: agora })
        .in('id', pendentes)
        .then(() =>
          setDoBanco((lista) => lista.map((n) => (n.lida_em ? n : { ...n, lida_em: agora }))),
        )
    }
    const todas = new Set(itens.map((i) => i.id))
    setLidas(todas)
    try {
      localStorage.setItem(CHAVE_LIDAS, JSON.stringify([...todas]))
    } catch {
      /* sem storage: vale so nesta sessao */
    }
  }, [itens, doBanco])

  return { itens, naoLidas: naoLidas.length, marcarTodasLidas, lidas: lidasTotais }
}
