import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOcupacaoRotas } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { hoje, horaCurta } from '../lib/format'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { ROTULO_PERFIL_USO, type Alocacao, type Presenca as PresencaTipo } from '../lib/types'

type Trecho = 'ida' | 'volta'

interface AlvoCancelamento {
  estudanteId: string
  nome: string
  trecho: Trecho
}

/**
 * RF13 / RF14 — manifesto diário de embarque.
 * RN04: ida e volta são independentes.
 * RN05/RN16/RN17 são validadas pela função confirmar_presenca() no banco;
 * o cancelamento exige motivo e é gravado por cancelar_presenca().
 */
export default function Presenca() {
  const { data: rotas } = useOcupacaoRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [rotaId, setRotaId] = useState('')
  const [data, setData] = useState(hoje())
  const [alvo, setAlvo] = useState<AlvoCancelamento | null>(null)
  const [motivo, setMotivo] = useState('')

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
        .select('*, estudante:estudante_id (id, nome, prontuario, curso, perfil_uso)')
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
    mutationFn: async ({ estudanteId, trecho }: { estudanteId: string; trecho: Trecho }) => {
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

  const cancelar = useMutation({
    mutationFn: async () => {
      if (!alvo) throw new Error('Nenhum trecho selecionado.')
      const { data: r, error: err } = await supabase.rpc('cancelar_presenca', {
        p_estudante_id: alvo.estudanteId,
        p_trecho: alvo.trecho,
        p_motivo: motivo.trim(),
        p_data: data,
      })
      if (err) throw err
      return r as { mensagem: string }
    },
    onSuccess: (r) => {
      toast.sucesso(r.mensagem)
      qc.invalidateQueries({ queryKey: ['manifesto'] })
      fecharCancelamento()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirCancelamento(estudanteId: string, nome: string, trecho: Trecho) {
    setAlvo({ estudanteId, nome, trecho })
    setMotivo('')
  }

  function fecharCancelamento() {
    setAlvo(null)
    setMotivo('')
  }

  const kpis = useMemo(() => {
    const linhas = manifesto ?? []
    const ida = linhas.filter((l) => l.presenca?.confirmou_ida).length
    const volta = linhas.filter((l) => l.presenca?.confirmou_volta).length
    const cancelados = linhas.filter(
      (l) => l.presenca?.cancelou_ida || l.presenca?.cancelou_volta,
    ).length
    const capacidade = rotaSelecionada?.capacidade_maxima ?? 0
    return [
      { rotulo: 'Alocados', valor: linhas.length, cor: undefined },
      { rotulo: 'Confirmaram ida', valor: ida, cor: '#2E7D5A' },
      { rotulo: 'Confirmaram volta', valor: volta, cor: '#C4633A' },
      { rotulo: 'Cancelamentos', valor: cancelados, cor: '#9E3E3E' },
      { rotulo: 'Vagas remanescentes', valor: Math.max(0, capacidade - volta), cor: undefined },
    ]
  }, [manifesto, rotaSelecionada])

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Presença</h1>
          <div className="mt-1 text-[13px] text-muted">
            Manifesto diário, confirmações de ida e volta são independentes.
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

      <div className="mb-3.5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th w-12">#</th>
                <th className="th">Estudante</th>
                <th className="th text-center">Ida</th>
                <th className="th text-center">Volta</th>
                <th className="th">Registro</th>
                <th className="th text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {manifesto.map(({ alocacao, presenca }, i) => {
                const est = alocacao.estudante
                const nome = est?.nome ?? '—'
                const perfilUso = est?.perfil_uso ?? 'ida_volta'
                const cancelamento =
                  presenca?.motivo_cancelamento_ida ?? presenca?.motivo_cancelamento_volta ?? null

                return (
                  <tr key={alocacao.id} className="border-b border-line last:border-0">
                    <td className="td font-mono text-soft">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="td">
                      <div className="font-medium">{nome}</div>
                      <div className="font-mono text-[11px] text-soft">
                        Prontuário {est?.prontuario ?? '—'} · {ROTULO_PERFIL_USO[perfilUso]}
                      </div>
                    </td>
                    <td className="td text-center">
                      <Glifo
                        confirmado={presenca?.confirmou_ida}
                        cancelado={presenca?.cancelou_ida}
                        motivo={presenca?.motivo_cancelamento_ida}
                        naoSeAplica={perfilUso === 'somente_volta'}
                      />
                    </td>
                    <td className="td text-center">
                      <Glifo
                        confirmado={presenca?.confirmou_volta}
                        cancelado={presenca?.cancelou_volta}
                        motivo={presenca?.motivo_cancelamento_volta}
                        naoSeAplica={perfilUso === 'somente_ida'}
                      />
                    </td>
                    <td className="td text-[12px] text-muted">
                      <span className="font-mono">
                        {presenca?.hora_ida || presenca?.hora_volta
                          ? `${horaCurta(presenca.hora_ida)} · ${horaCurta(presenca.hora_volta)}`
                          : '—'}
                      </span>
                      {cancelamento && (
                        <div className="mt-0.5 text-[11px] text-danger">
                          Cancelado: {cancelamento}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap justify-end gap-1.5">
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
                        <button
                          onClick={() =>
                            abrirCancelamento(alocacao.estudante_id, nome, 'ida')
                          }
                          disabled={!presenca?.confirmou_ida}
                          title="Cancelar a presença de ida"
                          className="rounded-md border border-edge px-2.5 py-1 text-[11.5px] text-danger hover:bg-bg-danger disabled:opacity-40"
                        >
                          Cancelar ida
                        </button>
                        <button
                          onClick={() =>
                            abrirCancelamento(alocacao.estudante_id, nome, 'volta')
                          }
                          disabled={!presenca?.confirmou_volta}
                          title="Cancelar a presença de volta"
                          className="rounded-md border border-edge px-2.5 py-1 text-[11.5px] text-danger hover:bg-bg-danger disabled:opacity-40"
                        >
                          Cancelar volta
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

      <Modal
        aberto={!!alvo}
        titulo={`Cancelar presença de ${alvo?.trecho ?? ''}`}
        descricao={alvo ? `${alvo.nome} · ${data}` : undefined}
        largura={480}
        onFechar={fecharCancelamento}
        rodape={
          <>
            <button onClick={fecharCancelamento} className="btn-ghost">
              Voltar
            </button>
            <button
              onClick={() => cancelar.mutate()}
              disabled={!motivo.trim() || cancelar.isPending}
              className="btn-danger"
            >
              {cancelar.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </>
        }
      >
        <label>
          <span className="field-label">Motivo do cancelamento</span>
          <textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: estudante avisou que não vai embarcar hoje"
            className="field resize-none"
          />
          <span className="mt-1 block text-[11.5px] text-muted">
            O motivo é obrigatório e fica registrado no log administrativo (RN12). O assento
            volta a ficar disponível para a rota.
          </span>
        </label>
      </Modal>
    </div>
  )
}

/** Glifos do protótipo: ✓ confirmado, ✕ cancelado, ◔ aguardando, — não se aplica. */
function Glifo({
  confirmado,
  cancelado,
  motivo,
  naoSeAplica,
}: {
  confirmado?: boolean
  cancelado?: boolean
  motivo?: string | null
  naoSeAplica?: boolean
}) {
  if (naoSeAplica) return <span className="text-[15px] font-semibold text-soft">—</span>
  if (confirmado) return <span className="text-[15px] font-semibold text-success">✓</span>
  if (cancelado) {
    return (
      <span className="text-[15px] font-semibold text-danger" title={motivo ?? 'Cancelado'}>
        ✕
      </span>
    )
  }
  return <span className="text-[15px] font-semibold text-warn">◔</span>
}
