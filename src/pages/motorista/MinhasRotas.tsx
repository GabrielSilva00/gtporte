import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { useMinhasRotas } from '../../hooks/useMinhasRotas'
import { mensagemErro, supabase } from '../../lib/supabase'
import { badgeMotorista, dataBR, hora, horaCurta, percentual } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { CarregandoCards, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import { IconeSeta } from '../../components/icons'
import { ROTULO_SITUACAO_OPERACIONAL, type Motorista, type SituacaoOperacional } from '../../lib/types'

const COR_SITUACAO: Record<SituacaoOperacional, { bg: string; fg: string }> = {
  aguardando: { bg: '#FBEEDA', fg: '#8A5A15' },
  em_rota: { bg: '#EAF3EC', fg: '#2E7D5A' },
  concluida: { bg: '#EEF1EF', fg: '#6B7570' },
}

/** Visão geral das rotas e do cadastro do motorista logado. */
export default function MinhasRotas() {
  const { motoristaId } = useAuth()
  const { data: rotas, isLoading, error } = useMinhasRotas()

  const { data: motorista } = useQuery({
    queryKey: ['meu-cadastro-motorista', motoristaId],
    enabled: !!motoristaId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('motorista')
        .select('*')
        .eq('id', motoristaId!)
        .single()
      if (err) throw err
      return data as Motorista
    },
  })

  if (isLoading) return <CarregandoCards itens={2} altura={200} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Minhas rotas</h1>
        <div className="mt-1 text-[13px] text-muted">
          {rotas?.length ?? 0} rota(s) sob sua responsabilidade.
        </div>
      </div>

      {motorista && (
        <div className="card mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div>
            <div className="text-[11.5px] text-muted">Status</div>
            <div className="mt-1">
              <Badge estilo={badgeMotorista(motorista.status)} />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">CNH</div>
            <div className="mt-1 font-mono text-[13px]">
              {motorista.cnh} · cat. {motorista.categoria_cnh}
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Validade da CNH</div>
            <div className="mt-1 font-mono text-[13px]">{dataBR(motorista.validade_cnh)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Telefone</div>
            <div className="mt-1 font-mono text-[13px]">{motorista.telefone ?? '-'}</div>
          </div>
        </div>
      )}

      {rotas && rotas.length === 0 && (
        <Vazio
          titulo="Nenhuma rota atribuída"
          descricao="O setor de transporte vincula as rotas ao seu cadastro."
        />
      )}

      <div className="flex flex-col gap-3">
        {rotas?.map((r) => {
          const pct = percentual(r.passageiros, r.capacidade_maxima)
          return (
            <div key={r.rota_id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-primary">
                      {r.codigo}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-[3px] font-mono text-[10.5px] tracking-[0.04em]"
                      style={{
                        background: COR_SITUACAO[r.situacao_operacional].bg,
                        color: COR_SITUACAO[r.situacao_operacional].fg,
                      }}
                    >
                      {ROTULO_SITUACAO_OPERACIONAL[r.situacao_operacional].toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-[15px] font-semibold">{r.nome}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[15px] font-semibold">
                    {r.passageiros}
                    <span className="text-muted">/{r.capacidade_maxima}</span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar percentual={pct} altura={5} largura={90} />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-btn bg-tint p-3.5">
                <div className="flex-1">
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Partida</div>
                  <div className="mt-0.5 text-[13px] font-medium">{r.origem ?? '-'}</div>
                  <div className="mt-0.5 font-mono text-[14px] font-semibold text-primary">
                    {hora(r.horario_partida)}
                  </div>
                </div>
                <span className="text-accent">
                  <IconeSeta size={18} />
                </span>
                <div className="flex-1 text-right">
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Retorno</div>
                  <div className="mt-0.5 text-[13px] font-medium">{r.destino ?? '-'}</div>
                  <div className="mt-0.5 font-mono text-[14px] font-semibold text-primary">
                    {hora(r.horario_retorno)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                <span className="font-mono">
                  {r.placa} · {r.modelo}
                </span>
                {r.situacao_atualizada_em && (
                  <span className="font-mono text-[11px] text-soft">
                    situação atualizada às {horaCurta(r.situacao_atualizada_em)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
