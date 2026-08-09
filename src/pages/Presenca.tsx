import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOcupacaoRotas } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { hoje, horaCurta } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { ROTULO_PERFIL_USO, type Alocacao, type Presenca as PresencaTipo } from '../lib/types'

/**
 * RF13 / RF14 — manifesto diário de embarque.
 * RN04: ida e volta são independentes.
 * RN05/RN16/RN17 são validadas pela função confirmar_presenca() no banco.
 */
export default function Presenca() {
  const { data: rotas } = useOcupacaoRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [rotaId, setRotaId] = useState('')
  const [data, setData] = useState(hoje())

  useEffect(() => {
    if (!rotaId && rotas && rotas.length > 0) setRotaId(rotas[0].rota_id)
  }, [rotas, rotaId])

  const rotaSelecionada = rotas?.find((r) => r.rota_id === rotaId)

  const { data: manifesto, isLoading, error } = useQuery({
    queryKey: ['manifesto', rotaId, data],
    enabled: !!rotaId,
    queryFn: async () => {
      const { data: alocacoes, error: err } = await supabase
        .from('alocacao_estudante')
        .select('*, estudante:estudante_id (id, nome, ra, curso, perfil_uso)')
        .eq('rota_id', rotaId)
        .eq('ativa', true)
        .eq('situacao', 'alocado')
      if (err) throw err

      const ids = (alocacoes as unknown as Alocacao[]).map((a) => a.id)
      let presencas: PresencaTipo[] = []
      if (ids.length > 0) {
        const { data: p, error: erroP } = await supabase
          .from('presenca')
          .select('*')
          .eq('data', data)
          .in('alocacao_id', ids)
        if (erroP) throw erroP
        presencas = p as PresencaTipo[]
      }

      const porAlocacao = new Map(presencas.map((p) => [p.alocacao_id, p]))
      return (alocacoes as unknown as Alocacao[])
        .map((a) => ({ alocacao: a, presenca: porAlocacao.get(a.id) ?? null }))
        .sort((x, y) => (x.alocacao.estudante?.nome ?? '').localeCompare(y.alocacao.estudante?.nome ?? ''))
    },
  })

  const confirmar = useMutation({
    mutationFn: async ({ estudanteId, trecho }: { estudanteId: string; trecho: 'ida' | 'volta' }) => {
      const { data: r, error: err } = await supabase.rpc('confirmar_presenca', {
        p_estudante_id: estudanteId,
        p_trecho: trecho,
        p_data: data,
      })
      if (err) throw err
      return r as { mensagem: string }
    },
    onSuccess: (r) => {
      toast.sucesso(r.mensagem)
      qc.invalidateQueries({ queryKey: ['manifesto'] })
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const kpis = useMemo(() => {
    const linhas = manifesto ?? []
    const ida = linhas.filter((l) => l.presenca?.confirmou_ida).length
    const volta = linhas.filter((l) => l.presenca?.confirmou_volta).length
    const capacidade = rotaSelecionada?.capacidade_maxima ?? 0
    return [
      { rotulo: 'Alocados', valor: linhas.length, cor: undefined },
      { rotulo: 'Confirmaram ida', valor: ida, cor: '#2E7D5A' },
      { rotulo: 'Confirmaram volta', valor: volta, cor: '#C4633A' },
      { rotulo: 'Vagas remanescentes', valor: Math.max(0, capacidade - volta), cor: undefined },
    ]
  }, [manifesto, rotaSelecionada])

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Presença</h1>
          <div className="mt-1 text-[13px] text-muted">
            Manifesto diário — confirmações de ida e volta são independentes (RN04).
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
          />
          <select
            value={rotaId}
            onChange={(e) => setRotaId(e.target.value)}
            className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
          >
            {rotas?.map((r) => (
              <option key={r.rota_id} value={r.rota_id}>
                {r.codigo} · {r.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(({ rotulo, valor, cor }) => (
          <div key={rotulo} className="card p-3.5">
            <div className="text-[11.5px] text-muted">{rotulo}</div>
            <div className="mt-1 font-mono text-[22px] font-semibold" style={{ color: cor }}>
              {valor}
            </div>
          </div>
        ))}
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela linhas={8} />}

      {manifesto && manifesto.length === 0 && (
        <Vazio
          titulo="Nenhum estudante alocado nesta rota"
          descricao="Execute a distribuição automática para popular o manifesto."
        />
      )}

      {manifesto && manifesto.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th w-12">#</th>
                <th className="th">Estudante</th>
                <th className="th text-center">Ida</th>
                <th className="th text-center">Volta</th>
                <th className="th">Confirmada</th>
                <th className="th text-right">Registrar</th>
              </tr>
            </thead>
            <tbody>
              {manifesto.map(({ alocacao, presenca }, i) => {
                const est = alocacao.estudante
                const perfilUso = est?.perfil_uso ?? 'ida_volta'
                return (
                  <tr key={alocacao.id} className="border-b border-line last:border-0">
                    <td className="td font-mono text-soft">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="td">
                      <div className="font-medium">{est?.nome ?? '—'}</div>
                      <div className="font-mono text-[11px] text-soft">
                        RA {est?.ra ?? '—'} · {ROTULO_PERFIL_USO[perfilUso]}
                      </div>
                    </td>
                    <td className="td text-center">
                      <Glifo
                        confirmado={presenca?.confirmou_ida}
                        naoSeAplica={perfilUso === 'somente_volta'}
                      />
                    </td>
                    <td className="td text-center">
                      <Glifo
                        confirmado={presenca?.confirmou_volta}
                        naoSeAplica={perfilUso === 'somente_ida'}
                      />
                    </td>
                    <td className="td font-mono text-[12px] text-muted">
                      {presenca?.hora_ida || presenca?.hora_volta
                        ? `${horaCurta(presenca.hora_ida)} · ${horaCurta(presenca.hora_volta)}`
                        : '—'}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() =>
                            confirmar.mutate({ estudanteId: alocacao.estudante_id, trecho: 'ida' })
                          }
                          disabled={
                            confirmar.isPending ||
                            perfilUso === 'somente_volta' ||
                            !!presenca?.confirmou_ida
                          }
                          className="rounded-md border border-edge px-2.5 py-1 text-[11.5px] hover:bg-bg disabled:opacity-40"
                        >
                          Ida
                        </button>
                        <button
                          onClick={() =>
                            confirmar.mutate({ estudanteId: alocacao.estudante_id, trecho: 'volta' })
                          }
                          disabled={
                            confirmar.isPending ||
                            perfilUso === 'somente_ida' ||
                            !!presenca?.confirmou_volta
                          }
                          className="rounded-md border border-edge px-2.5 py-1 text-[11.5px] hover:bg-bg disabled:opacity-40"
                        >
                          Volta
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Glifos do protótipo: ✓ confirmado, ◔ aguardando, — não se aplica. */
function Glifo({ confirmado, naoSeAplica }: { confirmado?: boolean; naoSeAplica?: boolean }) {
  if (naoSeAplica) return <span className="text-[15px] font-semibold text-soft">—</span>
  if (confirmado) return <span className="text-[15px] font-semibold text-success">✓</span>
  return <span className="text-[15px] font-semibold text-warn">◔</span>
}
