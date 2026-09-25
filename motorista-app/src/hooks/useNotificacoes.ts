import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, meuUsuarioId } from '@/lib/supabase'
import { mostrarNoAparelho } from '@/lib/push'
import { destinoValido, type Destino } from '@/lib/navegacao'
import { ROTULO_DOC, useDocumentos } from '@/hooks/useMotorista'

/** Linha de `notificacao` (0027/0028): gerada pelos gatilhos do banco. */
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

export type TipoNotificacao = 'mensagem' | 'pedido' | 'cancelamento' | 'documento' | 'aviso'
const TIPOS: TipoNotificacao[] = ['mensagem', 'pedido', 'cancelamento', 'documento', 'aviso']

export interface Notificacao {
  id: string
  tipo: TipoNotificacao
  titulo: string
  detalhe: string
  quando: string
  destino?: Destino
  urgente?: boolean
}

const CHAVE_LIDAS = 'gtporte-motorista:notificacoes-lidas'
const DIAS_AVISO_VALIDADE = 30

function lerLidas(): Set<string> {
  try {
    const v = localStorage.getItem(CHAVE_LIDAS)
    return new Set(v ? (JSON.parse(v) as string[]) : [])
  } catch {
    return new Set()
  }
}

function diasAte(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  const alvo = new Date(y, m - 1, d).getTime()
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo - hoje.getTime()) / 86_400_000)
}

/**
 * Tudo que pede atencao do motorista, num lugar so (mesma ideia do sino do
 * estudante):
 *  - linhas de `notificacao` gravadas pelos gatilhos do banco: mensagem de
 *    aluno, pedido de volta, troca de onibus, aluno que cancelou a viagem
 *    do dia, documento revisado. Chegam em tempo real e a leitura fica
 *    no banco;
 *  - documento vencido ou vencendo em 30 dias, calculado aqui. A leitura
 *    desse fica no aparelho (localStorage).
 */
export function useNotificacoes() {
  const { docs } = useDocumentos()
  const [lidas, setLidas] = useState<Set<string>>(lerLidas)
  const [doBanco, setDoBanco] = useState<NotificacaoBanco[]>([])

  useEffect(() => {
    let vivo = true
    let canal: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const uid = await meuUsuarioId()
      if (!uid || !vivo) return
      const { data } = await supabase
        .from('notificacao')
        .select('id,tipo,titulo,corpo,destino,urgente,lida_em,criado_em')
        .eq('perfil_id', uid)
        .order('criado_em', { ascending: false })
        .limit(50)
      if (vivo && data) setDoBanco(data as NotificacaoBanco[])

      canal = supabase
        .channel(`notificacoes-motorista:${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacao', filter: `perfil_id=eq.${uid}` },
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
  }, [])

  const itens = useMemo<Notificacao[]>(() => {
    const lista: Notificacao[] = doBanco.map((n) => ({
      id: `ntf:${n.id}`,
      tipo: TIPOS.includes(n.tipo as TipoNotificacao) ? (n.tipo as TipoNotificacao) : 'aviso',
      titulo: n.titulo,
      detalhe: n.corpo,
      quando: n.criado_em,
      destino: destinoValido(n.destino),
      urgente: n.urgente,
    }))

    for (const d of docs) {
      if (!d.validade || d.status === 'rejeitado') continue
      const dias = diasAte(d.validade)
      if (dias > DIAS_AVISO_VALIDADE) continue
      lista.push({
        id: `val:${d.id}:${d.validade}:${dias < 0 ? 'vencido' : 'vencendo'}`,
        tipo: 'documento',
        titulo: dias < 0 ? `${ROTULO_DOC[d.tipo]} vencido` : `${ROTULO_DOC[d.tipo]} vence em ${dias} dia${dias === 1 ? '' : 's'}`,
        detalhe: 'Envie o documento atualizado em Perfil › Meus documentos.',
        // Aparece no topo do dia em que entrou na janela de aviso.
        quando: new Date().toISOString().slice(0, 10) + 'T00:00:00',
        destino: 'documentos',
        urgente: dias < 0,
      })
    }

    return lista.sort((a, b) => +new Date(b.quando) - +new Date(a.quando))
  }, [doBanco, docs])

  const lidasTotais = useMemo(() => {
    const t = new Set(lidas)
    for (const n of doBanco) if (n.lida_em) t.add(`ntf:${n.id}`)
    return t
  }, [lidas, doBanco])

  const naoLidas = itens.filter((i) => !lidasTotais.has(i.id)).length

  const marcarTodasLidas = useCallback(() => {
    const pendentes = doBanco.filter((n) => !n.lida_em).map((n) => n.id)
    if (pendentes.length > 0) {
      const agora = new Date().toISOString()
      supabase
        .from('notificacao')
        .update({ lida_em: agora })
        .in('id', pendentes)
        .then(() => setDoBanco((lista) => lista.map((n) => (n.lida_em ? n : { ...n, lida_em: agora }))))
    }
    const todas = new Set(itens.map((i) => i.id))
    setLidas(todas)
    try {
      localStorage.setItem(CHAVE_LIDAS, JSON.stringify([...todas]))
    } catch {
      /* sem storage: vale so nesta sessao */
    }
  }, [itens, doBanco])

  return { itens, naoLidas, marcarTodasLidas, lidas: lidasTotais }
}
