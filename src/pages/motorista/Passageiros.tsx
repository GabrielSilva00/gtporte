import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMinhasRotas } from '../../hooks/useMinhasRotas'
import { mensagemErro, supabase } from '../../lib/supabase'
import { dataExtenso, hoje, hora, horaCurta } from '../../lib/format'
import { Avatar } from '../../components/ui/Avatar'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeCheck, IconeRelogio, IconeSeta, IconeVeiculo } from '../../components/icons'
import {
  ROTULO_PERFIL_USO,
  ROTULO_SITUACAO_OPERACIONAL,
  type Alocacao,
  type Presenca,
  type SituacaoOperacional,
} from '../../lib/types'

const SITUACOES: SituacaoOperacional[] = ['aguardando', 'em_rota', 'concluida']

/**
 * RF12 — lista de passageiros da rota.
 * RF15 — atualização da situação operacional e registro de posição.
 */
export default function Passageiros() {
  const { data: rotas, isLoading: carregandoRotas, error: erroRotas } = useMinhasRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [rotaId, setRotaId] = useState('')
  const data = hoje()

  useEffect(() => {
    if (!rotaId && rotas && rotas.length > 0) setRotaId(rotas[0].rota_id)
  }, [rotas, rotaId])

  const rota = rotas?.find((r) => r.rota_id === rotaId)

  const { data: manifesto, isLoading, error } = useQuery({
    queryKey: ['passageiros-motorista', rotaId, data],
    enabled: !!rotaId,
    queryFn: async () => {
      const { data: alocacoes, error: err } = await supabase
        .from('alocacao_estudante')
        .select(
          '*, estudante:estudante_id (id, nome, ra, curso, perfil_uso, universidade:universidade_id (nome))',
        )
        .eq('rota_id', rotaId)
        .eq('ativa', true)
        .eq('situacao', 'alocado')
      if (err) throw err

      const lista = alocacoes as unknown as (Alocacao & {
        estudante: (Alocacao['estudante'] & { universidade: { nome: string } | null }) | null
      })[]

      const ids = lista.map((a) => a.id)
      let presencas: Presenca[] = []
      if (ids.length > 0) {
        const { data: p, error: erroP } = await supabase
          .from('presenca')
          .select('*')
          .eq('data', data)
          .in('alocacao_id', ids)
        if (erroP) throw erroP
        presencas = p as Presenca[]
      }

      const porAlocacao = new Map(presencas.map((p) => [p.alocacao_id, p]))
      return lista
        .map((a) => ({ alocacao: a, presenca: porAlocacao.get(a.id) ?? null }))
        .sort((x, y) => (x.alocacao.estudante?.nome ?? '').localeCompare(y.alocacao.estudante?.nome ?? ''))
    },
    refetchInterval: 60_000,
  })

  const atualizarSituacao = useMutation({
    mutationFn: async (situacao: SituacaoOperacional) => {
      const { error: err } = await supabase.rpc('atualizar_situacao_rota', {
        p_rota_id: rotaId,
        p_situacao: situacao,
      })
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minhas-rotas-motorista'] })
      toast.sucesso('Situação da rota atualizada.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const registrarPosicao = useMutation({
    mutationFn: async () => {
      if (!('geolocation' in navigator)) {
        throw new Error('Este dispositivo não oferece geolocalização.')
      }
      const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
        })
      })
      const { error: err } = await supabase.from('localizacao_rota').insert({
        rota_id: rotaId,
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      })
      if (err) throw err
    },
    onSuccess: () => toast.sucesso('Posição registrada — os passageiros já conseguem ver.'),
    onError: (e) => {
      const msg = e instanceof GeolocationPositionError
        ? 'Permissão de localização negada pelo navegador.'
        : mensagemErro(e)
      toast.erro(msg)
    },
  })

  const contagens = useMemo(() => {
    const linhas = manifesto ?? []
    return {
      total: linhas.length,
      ida: linhas.filter((l) => l.presenca?.confirmou_ida).length,
      volta: linhas.filter((l) => l.presenca?.confirmou_volta).length,
    }
  }, [manifesto])

  if (carregandoRotas) return <CarregandoTabela linhas={5} />
  if (erroRotas) return <ErroCarregamento mensagem={mensagemErro(erroRotas)} />

  if (rotas && rotas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma rota atribuída a você"
        descricao="Assim que o setor de transporte vincular uma rota ao seu cadastro, os passageiros aparecem aqui."
      />
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Passageiros da rota</h1>
          <div className="mt-1 text-[13px] text-muted">{dataExtenso()}</div>
        </div>
        {rotas && rotas.length > 1 && (
          <select
            value={rotaId}
            onChange={(e) => setRotaId(e.target.value)}
            className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
          >
            {rotas.map((r) => (
              <option key={r.rota_id} value={r.rota_id}>
                {r.codigo} · {r.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {rota && (
        <div className="card mb-3.5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[13px] font-semibold text-primary">{rota.codigo}</div>
              <div className="mt-0.5 text-[16px] font-semibold">{rota.nome}</div>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-tint text-primary">
                <IconeVeiculo size={17} />
              </span>
              <div>
                <div className="font-mono font-medium">{rota.placa}</div>
                <div className="text-[11.5px] text-soft">
                  {rota.passageiros}/{rota.capacidade_maxima} lugares
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-btn bg-tint p-3.5">
            <div className="flex-1">
              <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Partida</div>
              <div className="mt-0.5 text-[13px] font-medium">{rota.origem ?? '—'}</div>
              <div className="mt-0.5 font-mono text-[15px] font-semibold text-primary">
                {hora(rota.horario_partida)}
              </div>
            </div>
            <span className="text-accent">
              <IconeSeta size={18} />
            </span>
            <div className="flex-1 text-right">
              <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Retorno</div>
              <div className="mt-0.5 text-[13px] font-medium">{rota.destino ?? '—'}</div>
              <div className="mt-0.5 font-mono text-[15px] font-semibold text-primary">
                {hora(rota.horario_retorno)}
              </div>
            </div>
          </div>

          {/* RF15 — situação operacional e posição */}
          <div className="mt-4 border-t border-line pt-4">
            <div className="field-label">Situação da viagem</div>
            <div className="flex flex-wrap gap-2">
              {SITUACOES.map((s) => (
                <button
                  key={s}
                  onClick={() => atualizarSituacao.mutate(s)}
                  disabled={atualizarSituacao.isPending}
                  className={`rounded-field border px-3.5 py-2 text-[12.5px] transition-colors ${
                    rota.situacao_operacional === s
                      ? 'border-primary bg-primary font-medium text-primary-fg'
                      : 'border-edge bg-surface hover:border-primary/40'
                  }`}
                >
                  {ROTULO_SITUACAO_OPERACIONAL[s]}
                </button>
              ))}
              <button
                onClick={() => registrarPosicao.mutate()}
                disabled={registrarPosicao.isPending}
                className="btn-ghost px-3.5 py-2 text-[12.5px]"
              >
                {registrarPosicao.isPending ? 'Obtendo…' : 'Registrar posição'}
              </button>
            </div>
            {rota.situacao_atualizada_em && (
              <div className="mt-2 font-mono text-[11px] text-soft">
                Atualizada às {horaCurta(rota.situacao_atualizada_em)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-3 gap-3">
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Passageiros</div>
          <div className="mt-1 font-mono text-[22px] font-semibold">{contagens.total}</div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Confirmaram ida</div>
          <div className="mt-1 font-mono text-[22px] font-semibold text-success">
            {contagens.ida}
          </div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11.5px] text-muted">Confirmaram volta</div>
          <div className="mt-1 font-mono text-[22px] font-semibold text-accent">
            {contagens.volta}
          </div>
        </div>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela linhas={6} />}

      {manifesto && manifesto.length === 0 && (
        <Vazio
          titulo="Nenhum passageiro alocado"
          descricao="A lista é preenchida quando o setor executa a distribuição."
        />
      )}

      {manifesto && manifesto.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Estudante</th>
                <th className="th hidden sm:table-cell">Universidade</th>
                <th className="th text-center">Ida</th>
                <th className="th text-center">Volta</th>
              </tr>
            </thead>
            <tbody>
              {manifesto.map(({ alocacao, presenca }) => {
                const est = alocacao.estudante
                return (
                  <tr key={alocacao.id} className="border-b border-line last:border-0">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar nome={est?.nome ?? '?'} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{est?.nome ?? '—'}</div>
                          <div className="font-mono text-[11px] text-soft">
                            RA {est?.ra ?? '—'} ·{' '}
                            {est ? ROTULO_PERFIL_USO[est.perfil_uso] : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td hidden text-[12.5px] sm:table-cell">
                      {est?.universidade?.nome ?? '—'}
                    </td>
                    <td className="td text-center">
                      <Marca confirmado={!!presenca?.confirmou_ida} hora={presenca?.hora_ida} />
                    </td>
                    <td className="td text-center">
                      <Marca confirmado={!!presenca?.confirmou_volta} hora={presenca?.hora_volta} />
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

function Marca({ confirmado, hora }: { confirmado: boolean; hora?: string | null }) {
  if (!confirmado) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-warn">
        <IconeRelogio size={13} />
        aguardando
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-success">
      <IconeCheck size={13} />
      <span className="font-mono">{horaCurta(hora)}</span>
    </span>
  )
}
