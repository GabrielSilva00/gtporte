import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useComunicados } from '@/hooks/useComunicados'
import { useDocumentos, ROTULO_DOC, type Documento } from '@/hooks/useEstudante'
import { useAlteracoes } from '@/hooks/useAlteracoes'
import type { Tab } from '@/components/BottomNav'

export type TipoNotificacao = 'comunicado' | 'documento' | 'mensagem' | 'cadastro'

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
 * O "lido" e por aparelho (localStorage): nao ha tabela de leitura por
 * notificacao, e cada item nasce de uma fonte diferente.
 */
export function useNotificacoes(estudanteId: string | null) {
  const { comunicados } = useComunicados()
  const { docs } = useDocumentos(estudanteId)
  const { itens: alteracoes } = useAlteracoes(estudanteId)
  const [mensagens, setMensagens] = useState<
    { id: string; assunto: string; corpo: string; criado_em: string }[]
  >([])
  const [lidas, setLidas] = useState<Set<string>>(lerLidas)

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
  }, [comunicados, docs, mensagens, alteracoes])

  const naoLidas = itens.filter((i) => !lidas.has(i.id))

  const marcarTodasLidas = useCallback(() => {
    const todas = new Set(itens.map((i) => i.id))
    setLidas(todas)
    try {
      localStorage.setItem(CHAVE_LIDAS, JSON.stringify([...todas]))
    } catch {
      /* sem storage: vale so nesta sessao */
    }
  }, [itens])

  return { itens, naoLidas: naoLidas.length, marcarTodasLidas, lidas }
}
