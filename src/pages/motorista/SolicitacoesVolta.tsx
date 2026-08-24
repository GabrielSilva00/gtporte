import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMinhasRotas } from '../../hooks/useMinhasRotas'
import { mensagemErro, supabase } from '../../lib/supabase'
import { badgeSolicitacaoVolta, dataBR, dataHoraBR } from '../../lib/format'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Tabs } from '../../components/ui/Tabs'
import { CarregandoCards, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeCheck, IconeInfo } from '../../components/icons'
import type { SolicitacaoStatus } from '../../lib/types'

/** Linha da fila, com os dados do estudante trazidos pelo embed. */
interface SolicitacaoFila {
  id: string
  data: string
  justificativa: string
  status: SolicitacaoStatus
  motivo_recusa: string | null
  decidido_em: string | null
  criado_em: string
  rota_id: string
  alocacao: {
    estudante: { id: string; nome: string; prontuario: string; curso: string | null } | null
  } | null
}

type Filtro = 'pendente' | 'decididas'

/**
 * RF13 ampliado — o motorista decide os pedidos de embarque somente na
 * volta feitos pelos estudantes da rota dele (migration 0012).
 */
export default function SolicitacoesVolta() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rotas } = useMinhasRotas()

  const [filtro, setFiltro] = useState<Filtro>('pendente')
  const [recusando, setRecusando] = useState<SolicitacaoFila | null>(null)
  const [motivo, setMotivo] = useState('')

  const idsRotas = useMemo(() => (rotas ?? []).map((r) => r.rota_id), [rotas])

  const { data: solicitacoes, isLoading, error } = useQuery({
    queryKey: ['solicitacoes-volta-motorista', idsRotas],
    enabled: idsRotas.length > 0,
    // A decisão é sensível ao tempo: o motorista precisa ver o pedido novo
    // antes de sair para a volta.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('solicitacao_volta')
        .select(
          'id, data, justificativa, status, motivo_recusa, decidido_em, criado_em, rota_id, ' +
            'alocacao:alocacao_id (estudante:estudante_id (id, nome, prontuario, curso))',
        )
        .in('rota_id', idsRotas)
        .order('criado_em', { ascending: false })
        .limit(200)
      if (err) throw err
      return data as unknown as SolicitacaoFila[]
    },
  })

  const decidir = useMutation({
    mutationFn: async (p: { id: string; aprovar: boolean; motivo?: string }) => {
      const { data, error: err } = await supabase.rpc('decidir_solicitacao_volta', {
        p_solicitacao_id: p.id,
        p_aprovar: p.aprovar,
        p_motivo: p.motivo ?? null,
      })
      if (err) throw err
      return data as { mensagem: string }
    },
    onSuccess: (r) => {
      toast.sucesso(r.mensagem)
      setRecusando(null)
      setMotivo('')
      qc.invalidateQueries({ queryKey: ['solicitacoes-volta-motorista'] })
      qc.invalidateQueries({ queryKey: ['passageiros-rota'] })
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const pendentes = (solicitacoes ?? []).filter((s) => s.status === 'pendente')
  const decididas = (solicitacoes ?? []).filter((s) => s.status !== 'pendente')
  const lista = filtro === 'pendente' ? pendentes : decididas

  const codigoDaRota = useMemo(
    () => new Map((rotas ?? []).map((r) => [r.rota_id, r.codigo])),
    [rotas],
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Solicitações de volta</h1>
        <div className="mt-1 text-[13px] text-muted">
          Estudantes que não embarcaram na ida e pedem para voltar no seu veículo.
        </div>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoCards itens={3} altura={120} />}

      <Tabs
        variante="pilulas"
        className="mb-3.5"
        abas={[
          { chave: 'pendente', rotulo: 'Aguardando decisão', contador: pendentes.length },
          { chave: 'decididas', rotulo: 'Já decididas', contador: decididas.length },
        ]}
        ativa={filtro}
        onMudar={setFiltro}
      />

      {!isLoading && lista.length === 0 && (
        <Vazio
          titulo={
            filtro === 'pendente'
              ? 'Nenhuma solicitação aguardando'
              : 'Nenhuma solicitação decidida ainda'
          }
          descricao="Quando um estudante justificar o embarque somente na volta, o pedido aparece aqui."
        />
      )}

      <div className="flex flex-col gap-3">
        {lista.map((s) => {
          const estudante = s.alocacao?.estudante
          return (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar nome={estudante?.nome ?? '—'} tamanho={34} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium">
                      {estudante?.nome ?? 'Estudante removido'}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      {estudante?.prontuario ?? '—'} · rota {codigoDaRota.get(s.rota_id) ?? '—'} ·{' '}
                      {dataBR(s.data)}
                    </div>
                  </div>
                </div>
                <Badge estilo={badgeSolicitacaoVolta(s.status)} />
              </div>

              <p className="mt-3 rounded-btn bg-tint px-3.5 py-3 text-[12.5px] leading-relaxed">
                {s.justificativa}
              </p>

              {s.status === 'pendente' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => decidir.mutate({ id: s.id, aprovar: true })}
                    disabled={decidir.isPending}
                    className="btn-success px-3.5 py-2 text-[12.5px]"
                  >
                    <IconeCheck size={14} />
                    Aceitar embarque
                  </button>
                  <button
                    onClick={() => {
                      setRecusando(s)
                      setMotivo('')
                    }}
                    className="btn-danger px-3.5 py-2 text-[12.5px]"
                  >
                    Recusar
                  </button>
                  <span className="ml-auto font-mono text-[10.5px] text-soft">
                    enviada {dataHoraBR(s.criado_em)}
                  </span>
                </div>
              ) : (
                <div className="mt-2.5">
                  {s.motivo_recusa && (
                    <div className="rounded-md bg-bg-danger px-2.5 py-2 text-[11.5px] text-danger">
                      <b>Motivo informado:</b> {s.motivo_recusa}
                    </div>
                  )}
                  <div className="mt-1.5 font-mono text-[10.5px] text-soft">
                    decidida {dataHoraBR(s.decidido_em)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {idsRotas.length === 0 && !isLoading && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3 text-[12.5px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          Você ainda não tem rota sob sua responsabilidade, então não há solicitações a decidir.
        </div>
      )}

      <Modal
        aberto={!!recusando}
        titulo="Recusar solicitação"
        descricao="O estudante vê o motivo e pode enviar uma nova justificativa."
        largura={480}
        onFechar={() => setRecusando(null)}
        rodape={
          <>
            <button onClick={() => setRecusando(null)} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() =>
                recusando && decidir.mutate({ id: recusando.id, aprovar: false, motivo })
              }
              disabled={!motivo.trim() || decidir.isPending}
              className="btn-danger"
            >
              {decidir.isPending ? 'Enviando…' : 'Confirmar recusa'}
            </button>
          </>
        }
      >
        <label>
          <span className="field-label">Motivo da recusa</span>
          <textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: veículo já está com todos os assentos ocupados na volta de hoje."
            className="field resize-y"
          />
        </label>
        <p className="mt-2 text-[11.5px] text-muted">
          O motivo é obrigatório e fica registrado no histórico da solicitação.
        </p>
      </Modal>
    </div>
  )
}
