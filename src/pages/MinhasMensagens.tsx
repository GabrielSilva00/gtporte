import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { Badge } from '../components/ui/Badge'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeEnviar } from '../components/icons'
import type { Mensagem, StatusMensagem, TipoMensagem } from '../lib/types'

const BADGE_STATUS: Record<StatusMensagem, { rotulo: string; bg: string; fg: string }> = {
  aberta: { rotulo: 'Aguardando resposta', bg: '#FBEEDA', fg: '#8A5A15' },
  respondida: { rotulo: 'Respondida', bg: '#EAF3EC', fg: '#2E7D5A' },
  encerrada: { rotulo: 'Encerrada', bg: '#EEF1EF', fg: '#6B7570' },
}

/**
 * Canal de contato dos painéis do estudante e do motorista com o setor de
 * transporte. É a origem das mensagens que aparecem na Visão geral e nas
 * telas de Mensagens/Solicitações do painel administrativo.
 */
export default function MinhasMensagens() {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [tipo, setTipo] = useState<TipoMensagem>('mensagem')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')

  const { data: minhas, isLoading, error } = useQuery({
    queryKey: ['minhas-mensagens', perfil?.id],
    enabled: !!perfil,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem')
        .select('*, remetente:remetente_id (id, nome, tipo)')
        .order('criado_em', { ascending: false })
      if (err) throw err
      return data as unknown as Mensagem[]
    },
  })

  // Uma linha por conversa; as respostas do setor entram aninhadas
  const conversas = (minhas ?? []).filter((m) => !m.responde_a)
  const respostasPor = new Map<string, Mensagem[]>()
  ;(minhas ?? [])
    .filter((m) => m.responde_a)
    .forEach((m) => {
      const lista = respostasPor.get(m.responde_a!) ?? []
      lista.push(m)
      respostasPor.set(m.responde_a!, lista)
    })

  const enviar = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error('Sessão expirada. Faça login novamente.')
      const { error: err } = await supabase.from('mensagem').insert({
        remetente_id: perfil.id,
        // Sem destinatário: a mensagem vai para o setor de transporte
        destinatario_id: null,
        tipo,
        assunto: assunto.trim(),
        corpo: corpo.trim(),
      })
      if (err) throw err
    },
    onSuccess: () => {
      setAssunto('')
      setCorpo('')
      qc.invalidateQueries({ queryKey: ['minhas-mensagens'] })
      toast.sucesso('Mensagem enviada ao setor de transporte.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (isLoading) return <CarregandoCards itens={2} altura={160} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Mensagens</h1>
        <div className="mt-1 text-[13px] text-muted">
          Fale com o setor de transporte e acompanhe as respostas.
        </div>
      </div>

      <div className="card mb-5 p-5">
        <div className="field-label">Tipo</div>
        <div className="mb-3.5 flex gap-2">
          {(
            [
              { valor: 'mensagem' as TipoMensagem, rotulo: 'Mensagem' },
              { valor: 'solicitacao' as TipoMensagem, rotulo: 'Solicitação' },
            ]
          ).map((op) => (
            <button
              key={op.valor}
              onClick={() => setTipo(op.valor)}
              className={`rounded-btn border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                tipo === op.valor
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-edge bg-surface text-muted hover:border-primary/40'
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>
        <p className="mb-3.5 text-[11.5px] text-muted">
          Use <b>Solicitação</b> para pedidos que dependem de uma decisão do setor — troca de
          rota, saída da rota, revisão de documento. As demais dúvidas entram como mensagem.
        </p>

        <label className="block">
          <span className="field-label">Assunto</span>
          <input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder={tipo === 'solicitacao' ? 'Troca de rota' : 'Dúvida sobre o horário'}
            className="field"
          />
        </label>

        <label className="mt-3 block">
          <span className="field-label">Mensagem</span>
          <textarea
            rows={4}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            placeholder="Descreva o que você precisa…"
            className="field resize-none"
          />
        </label>

        <button
          onClick={() => enviar.mutate()}
          disabled={!assunto.trim() || !corpo.trim() || enviar.isPending}
          className="btn-primary mt-4 w-full py-3"
        >
          <IconeEnviar size={14} />
          {enviar.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      {conversas.length > 0 && (
        <>
          <div className="mb-3 text-[14px] font-semibold">Seu histórico</div>
          <div className="flex flex-col gap-2.5">
            {conversas.map((m) => (
              <div key={m.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{m.assunto}</span>
                    {m.tipo === 'solicitacao' && (
                      <span className="rounded-full bg-tint px-2 py-0.5 text-[10.5px] text-muted">
                        solicitação
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge estilo={BADGE_STATUS[m.status]} />
                    <span className="font-mono text-[10.5px] text-soft">
                      {dataHoraBR(m.criado_em)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
                  {m.corpo}
                </div>

                {(respostasPor.get(m.id) ?? []).map((r) => (
                  <div key={r.id} className="mt-2.5 rounded-btn bg-tint px-3.5 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px] text-muted">
                      <span className="font-medium">
                        {r.remetente?.nome ?? 'Setor de transporte'}
                      </span>
                      <span className="font-mono text-[10.5px]">{dataHoraBR(r.criado_em)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
                      {r.corpo}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
