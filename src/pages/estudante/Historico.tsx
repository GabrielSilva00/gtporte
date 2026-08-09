import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { mensagemErro, supabase } from '../../lib/supabase'
import { badgeAlocacao, dataBR, horaCurta } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import type { Alocacao, Presenca } from '../../lib/types'

interface LinhaHistorico {
  presenca: Presenca
  rota: string
}

/** RF24 — histórico de utilização do transporte pelo estudante. */
export default function Historico() {
  const { estudanteId } = useAuth()

  const { data, isLoading, error } = useQuery({
    queryKey: ['meu-historico', estudanteId],
    enabled: !!estudanteId,
    queryFn: async () => {
      const { data: alocacoes, error: err } = await supabase
        .from('alocacao_estudante')
        .select('*, rota:rota_id (id, codigo, nome)')
        .eq('estudante_id', estudanteId!)
        .order('criado_em', { ascending: false })
      if (err) throw err

      const lista = alocacoes as unknown as Alocacao[]
      const ids = lista.map((a) => a.id)

      let presencas: Presenca[] = []
      if (ids.length > 0) {
        const { data: p, error: erroP } = await supabase
          .from('presenca')
          .select('*')
          .in('alocacao_id', ids)
          .order('data', { ascending: false })
          .limit(200)
        if (erroP) throw erroP
        presencas = p as Presenca[]
      }

      const rotaPorAlocacao = new Map(lista.map((a) => [a.id, a.rota?.codigo ?? '—']))
      const viagens: LinhaHistorico[] = presencas.map((p) => ({
        presenca: p,
        rota: rotaPorAlocacao.get(p.alocacao_id) ?? '—',
      }))

      const totalIda = presencas.filter((p) => p.confirmou_ida).length
      const totalVolta = presencas.filter((p) => p.confirmou_volta).length

      return { alocacoes: lista, viagens, totalIda, totalVolta }
    },
  })

  if (isLoading) return <CarregandoTabela linhas={6} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (!data) return null

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Histórico</h1>
        <div className="mt-1 text-[13px] text-muted">Suas viagens e alocações anteriores.</div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Dias registrados</div>
          <div className="mt-1 font-mono text-[22px] font-semibold">{data.viagens.length}</div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Embarques de ida</div>
          <div className="mt-1 font-mono text-[22px] font-semibold text-success">
            {data.totalIda}
          </div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Embarques de volta</div>
          <div className="mt-1 font-mono text-[22px] font-semibold text-accent">
            {data.totalVolta}
          </div>
        </div>
      </div>

      <div className="mb-3 text-[14px] font-semibold">Viagens</div>
      {data.viagens.length === 0 ? (
        <Vazio
          titulo="Nenhuma viagem registrada"
          descricao="Suas confirmações de presença aparecem aqui."
        />
      ) : (
        <div className="card mb-6 overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Data</th>
                <th className="th">Rota</th>
                <th className="th text-center">Ida</th>
                <th className="th text-center">Volta</th>
              </tr>
            </thead>
            <tbody>
              {data.viagens.map(({ presenca, rota }) => (
                <tr key={presenca.id} className="border-b border-line last:border-0">
                  <td className="td font-mono text-[12px]">{dataBR(presenca.data)}</td>
                  <td className="td font-mono font-medium text-primary">{rota}</td>
                  <td className="td text-center">
                    {presenca.confirmou_ida ? (
                      <span className="font-mono text-[11.5px] text-success">
                        ✓ {horaCurta(presenca.hora_ida)}
                      </span>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                  <td className="td text-center">
                    {presenca.confirmou_volta ? (
                      <span className="font-mono text-[11.5px] text-success">
                        ✓ {horaCurta(presenca.hora_volta)}
                      </span>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-3 text-[14px] font-semibold">Alocações</div>
      <div className="card overflow-hidden">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-edge">
              <th className="th">Rota</th>
              <th className="th">Situação</th>
              <th className="th">Início</th>
              <th className="th">Fim</th>
            </tr>
          </thead>
          <tbody>
            {data.alocacoes.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0">
                <td className="td">
                  <span className="font-mono font-medium text-primary">
                    {a.rota?.codigo ?? '—'}
                  </span>
                  {a.rota?.nome && (
                    <span className="ml-2 text-[12px] text-muted">{a.rota.nome}</span>
                  )}
                </td>
                <td className="td">
                  <Badge estilo={badgeAlocacao(a.situacao)} />
                </td>
                <td className="td font-mono text-[12px] text-muted">{dataBR(a.criado_em)}</td>
                <td className="td font-mono text-[12px] text-muted">
                  {a.encerrado_em ? dataBR(a.encerrado_em) : 'em vigor'}
                </td>
              </tr>
            ))}
            {data.alocacoes.length === 0 && (
              <tr>
                <td colSpan={4} className="td py-8 text-center text-muted">
                  Nenhuma alocação até o momento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
