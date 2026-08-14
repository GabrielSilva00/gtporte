import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeEnviar } from '../components/icons'
import {
  ROTULO_TIPO_PERFIL,
  type Mensagem,
  type MensagemModelo,
  type StatusMensagem,
  type TipoMensagem,
} from '../lib/types'

const BADGE_STATUS: Record<StatusMensagem, { rotulo: string; bg: string; fg: string }> = {
  aberta: { rotulo: 'Aberta', bg: '#FBEEDA', fg: '#8A5A15' },
  respondida: { rotulo: 'Respondida', bg: '#EAF3EC', fg: '#2E7D5A' },
  encerrada: { rotulo: 'Encerrada', bg: '#EEF1EF', fg: '#6B7570' },
}

const SELECT_MENSAGEM = `
  *,
  remetente:remetente_id (id, nome, tipo),
  destinatario:destinatario_id (id, nome, tipo)
`

/**
 * Canal único de comunicação: a mesma tabela atende a caixa de entrada
 * (tipo = 'mensagem') e as solicitações (tipo = 'solicitacao'). O que muda
 * entre as duas telas é apenas o filtro.
 */
export default function Mensagens({ tipo = 'mensagem' }: { tipo?: TipoMensagem }) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [filtro, setFiltro] = useState<'' | StatusMensagem>('')
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [resposta, setResposta] = useState('')

  const solicitacoes = tipo === 'solicitacao'

  const { data: mensagens, isLoading, error } = useQuery({
    queryKey: ['mensagens', tipo],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem')
        .select(SELECT_MENSAGEM)
        .eq('tipo', tipo)
        .is('responde_a', null)
        .order('criado_em', { ascending: false })
      if (err) throw err
      return data as unknown as Mensagem[]
    },
  })

  const { data: modelos } = useQuery({
    queryKey: ['mensagem-modelos'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem_modelo')
        .select('*')
        .order('titulo')
      if (err) throw err
      return data as MensagemModelo[]
    },
    staleTime: 5 * 60_000,
  })

  const selecionada = useMemo(
    () => mensagens?.find((m) => m.id === selecionadaId) ?? null,
    [mensagens, selecionadaId],
  )

  // Fio da conversa da mensagem aberta
  const { data: respostas } = useQuery({
    queryKey: ['mensagem-thread', selecionadaId],
    enabled: !!selecionadaId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem')
        .select(SELECT_MENSAGEM)
        .eq('responde_a', selecionadaId!)
        .order('criado_em')
      if (err) throw err
      return data as unknown as Mensagem[]
    },
  })

  const filtradas = useMemo(
    () => (mensagens ?? []).filter((m) => !filtro || m.status === filtro),
    [mensagens, filtro],
  )

  // A primeira leitura marca a mensagem como lida — sem isso o badge do menu
  // nunca zeraria.
  const marcarLida = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('mensagem')
        .update({ lida_em: new Date().toISOString() })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensagens'] })
      qc.invalidateQueries({ queryKey: ['contadores-nav'] })
      qc.invalidateQueries({ queryKey: ['mensagens-recentes'] })
    },
  })

  useEffect(() => {
    if (selecionada && !selecionada.lida_em) marcarLida.mutate(selecionada.id)
    // marcarLida é estável entre renders do react-query; disparar por id basta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadaId])

  const responder = useMutation({
    mutationFn: async () => {
      if (!selecionada || !perfil) throw new Error('Selecione uma mensagem.')

      const { error: err } = await supabase.from('mensagem').insert({
        remetente_id: perfil.id,
        destinatario_id: selecionada.remetente_id,
        responde_a: selecionada.id,
        tipo: selecionada.tipo,
        assunto: `Re: ${selecionada.assunto}`,
        corpo: resposta.trim(),
      })
      if (err) throw err

      const { error: erroStatus } = await supabase
        .from('mensagem')
        .update({ status: 'respondida' })
        .eq('id', selecionada.id)
      if (erroStatus) throw erroStatus
    },
    onSuccess: () => {
      setResposta('')
      qc.invalidateQueries({ queryKey: ['mensagens'] })
      qc.invalidateQueries({ queryKey: ['mensagem-thread'] })
      qc.invalidateQueries({ queryKey: ['contadores-nav'] })
      qc.invalidateQueries({ queryKey: ['mensagens-recentes'] })
      toast.sucesso('Resposta enviada.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusMensagem }) => {
      const { error: err } = await supabase.from('mensagem').update({ status }).eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensagens'] })
      qc.invalidateQueries({ queryKey: ['contadores-nav'] })
      toast.sucesso('Situação atualizada.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">
            {solicitacoes ? 'Solicitações' : 'Mensagens'}
          </h1>
          <div className="mt-1 text-[13px] text-muted">
            {solicitacoes
              ? 'Pedidos abertos por estudantes e motoristas aguardando análise do setor.'
              : 'Caixa de entrada do setor de transporte.'}
          </div>
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as '' | StatusMensagem)}
          className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
        >
          <option value="">Todas as situações</option>
          <option value="aberta">Abertas</option>
          <option value="respondida">Respondidas</option>
          <option value="encerrada">Encerradas</option>
        </select>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela linhas={6} />}

      {mensagens && filtradas.length === 0 && (
        <Vazio
          titulo={solicitacoes ? 'Nenhuma solicitação' : 'Nenhuma mensagem'}
          descricao={
            filtro
              ? 'Nenhum registro nesta situação. Ajuste o filtro.'
              : 'Estudantes e motoristas escrevem pelo painel deles e as mensagens chegam aqui.'
          }
        />
      )}

      {filtradas.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,340px)_1fr]">
          {/* Lista */}
          <div className="card divide-y divide-line overflow-hidden">
            {filtradas.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelecionadaId(m.id)}
                className={`flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors ${
                  m.id === selecionadaId ? 'bg-tint' : 'hover:bg-bg'
                }`}
              >
                <Avatar nome={m.remetente?.nome ?? '?'} tamanho={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium">
                      {m.remetente?.nome ?? 'Remetente removido'}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-soft">
                      {dataHoraBR(m.criado_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {!m.lida_em && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    <span className="truncate text-[12.5px]">{m.assunto}</span>
                  </div>
                  <div className="mt-1 truncate text-[11.5px] text-muted">{m.corpo}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Leitura e resposta */}
          <div className="card p-5">
            {!selecionada ? (
              <div className="py-16 text-center text-[12.5px] text-muted">
                Selecione uma {solicitacoes ? 'solicitação' : 'mensagem'} para ler.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3.5">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">{selecionada.assunto}</div>
                    <div className="mt-1 text-[12px] text-muted">
                      {selecionada.remetente?.nome ?? 'Remetente removido'}
                      {selecionada.remetente?.tipo && (
                        <> · {ROTULO_TIPO_PERFIL[selecionada.remetente.tipo]}</>
                      )}{' '}
                      · {dataHoraBR(selecionada.criado_em)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge estilo={BADGE_STATUS[selecionada.status]} />
                    {selecionada.status !== 'encerrada' && (
                      <button
                        onClick={() =>
                          mudarStatus.mutate({ id: selecionada.id, status: 'encerrada' })
                        }
                        disabled={mudarStatus.isPending}
                        className="btn-ghost px-3 py-1.5 text-[12px]"
                      >
                        Encerrar
                      </button>
                    )}
                  </div>
                </div>

                <div className="whitespace-pre-wrap py-4 text-[13px] leading-relaxed">
                  {selecionada.corpo}
                </div>

                {(respostas ?? []).length > 0 && (
                  <div className="flex flex-col gap-2.5 border-t border-line pt-4">
                    {(respostas ?? []).map((r) => (
                      <div key={r.id} className="rounded-btn bg-tint px-3.5 py-3">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px] text-muted">
                          <span className="font-medium">{r.remetente?.nome ?? '—'}</span>
                          <span className="font-mono text-[10.5px]">{dataHoraBR(r.criado_em)}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed">
                          {r.corpo}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-line pt-4">
                  {(modelos ?? []).length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {(modelos ?? []).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setResposta(m.corpo)}
                          title={m.assunto}
                          className="rounded-full border border-edge px-2.5 py-1 text-[11.5px] text-muted hover:border-primary/40 hover:text-ink"
                        >
                          {m.titulo}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={4}
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Escreva a resposta…"
                    className="field resize-none"
                  />
                  <button
                    onClick={() => responder.mutate()}
                    disabled={!resposta.trim() || responder.isPending}
                    className="btn-primary mt-2.5"
                  >
                    <IconeEnviar size={14} />
                    {responder.isPending ? 'Enviando…' : 'Responder'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
