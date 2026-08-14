import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOcupacaoRotas } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { hora, percentual } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Modal } from '../components/ui/Modal'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useToast } from '../components/ui/Toast'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import { IconeAlerta, IconeCheck, IconeRecarregar, IconeRelogio, IconeSeta } from '../components/icons'
import type {
  Alocacao as AlocacaoTipo,
  OcupacaoRota,
  ResultadoDistribuicao,
} from '../lib/types'

/**
 * RF09 (distribuição automática) e RF10 (ajuste manual).
 * A regra de negócio inteira roda no Postgres — ver executar_distribuicao()
 * e mover_alocacao_manual() em supabase/migrations/.
 */
export default function Alocacao() {
  const { data: ocupacoes, isLoading: carregandoRotas } = useOcupacaoRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [resultado, setResultado] = useState<ResultadoDistribuicao | null>(null)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [selecionado, setSelecionado] = useState<AlocacaoTipo | null>(null)
  const [rotaDestino, setRotaDestino] = useState('')

  const { data: alocacoes, isLoading, error } = useQuery({
    queryKey: ['alocacoes-painel'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('alocacao_estudante')
        .select(
          '*, estudante:estudante_id (id, nome, prontuario, curso, perfil_uso), rota:rota_id (id, codigo, nome)',
        )
        .eq('ativa', true)
      if (err) throw err
      return data as unknown as AlocacaoTipo[]
    },
  })

  // Horário de aulas por estudante — exibido junto do nome na listagem
  const { data: grades } = useQuery({
    queryKey: ['grades-resumo'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('grade_horaria')
        .select('estudante_id, hora_inicio, hora_fim')
      if (err) throw err
      // A grade tem uma linha por dia; o intervalo que importa para a rota
      // é o mais cedo até o mais tarde da semana, igual ao motor do banco.
      const faixa = new Map<string, { inicio: string; fim: string }>()
      data.forEach((g) => {
        const atual = faixa.get(g.estudante_id)
        faixa.set(g.estudante_id, {
          inicio: !atual || g.hora_inicio < atual.inicio ? g.hora_inicio : atual.inicio,
          fim: !atual || g.hora_fim > atual.fim ? g.hora_fim : atual.fim,
        })
      })
      return new Map(
        [...faixa].map(([id, f]) => [id, `${hora(f.inicio)}–${hora(f.fim)}`] as const),
      )
    },
  })

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['alocacoes-painel'] })
    qc.invalidateQueries({ queryKey: ['alocacoes-ativas'] })
    qc.invalidateQueries({ queryKey: ['ocupacao-rotas'] })
    qc.invalidateQueries({ queryKey: ['contadores-nav'] })
    qc.invalidateQueries({ queryKey: ['dashboard-totais'] })
    qc.invalidateQueries({ queryKey: ['notificacoes'] })
    qc.invalidateQueries({ queryKey: ['rotas'] })
  }

  const executar = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase.rpc('executar_distribuicao')
      if (err) throw err
      return data as ResultadoDistribuicao
    },
    onSuccess: (r) => {
      setResultado(r)
      // A função do banco já devolveu os dois formatos ao longo do projeto:
      // objetos {tipo, texto} e strings puras. Aceitamos os dois.
      ;(r.mensagens ?? []).forEach((m) => {
        if (typeof m === 'string') toast.alerta(m)
        else toast.notificar(m.tipo, m.texto)
      })
      toast.sucesso(`Distribuição concluída: ${r.alocados} estudante(s) alocado(s).`)
      invalidar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const mover = useMutation({
    mutationFn: async ({ estudanteId, rotaId }: { estudanteId: string; rotaId: string | null }) => {
      const { error: err } = await supabase.rpc('mover_alocacao_manual', {
        p_estudante_id: estudanteId,
        p_rota_destino_id: rotaId,
      })
      if (err) throw err
    },
    onSuccess: (_dados, variaveis) => {
      toast.sucesso(
        variaveis.rotaId
          ? 'Estudante movido para a rota selecionada.'
          : 'Estudante removido da rota e enviado para a fila de espera.',
      )
      fecharCartao()
      invalidar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const { porRota, fila, semRota } = useMemo(() => {
    const porRota = new Map<string, AlocacaoTipo[]>()
    const fila: AlocacaoTipo[] = []
    const semRota: AlocacaoTipo[] = []

    ;(alocacoes ?? []).forEach((a) => {
      if (a.rota_id && a.situacao === 'alocado') {
        const lista = porRota.get(a.rota_id) ?? []
        lista.push(a)
        porRota.set(a.rota_id, lista)
      } else if (a.situacao === 'sem_rota') {
        semRota.push(a)
      } else {
        fila.push(a)
      }
    })

    const porNome = (x: AlocacaoTipo, y: AlocacaoTipo) =>
      (x.estudante?.nome ?? '').localeCompare(y.estudante?.nome ?? '')
    porRota.forEach((lista) => lista.sort(porNome))
    fila.sort(porNome)
    semRota.sort(porNome)

    return { porRota, fila, semRota }
  }, [alocacoes])

  const rotasAtivas = useMemo(
    () => (ocupacoes ?? []).filter((o) => o.status !== 'inativa'),
    [ocupacoes],
  )

  function alternarRota(id: string) {
    setAbertas((atual) => {
      const proxima = new Set(atual)
      if (proxima.has(id)) proxima.delete(id)
      else proxima.add(id)
      return proxima
    })
  }

  function abrirCartao(a: AlocacaoTipo) {
    setSelecionado(a)
    setRotaDestino('')
  }

  function fecharCartao() {
    setSelecionado(null)
    setRotaDestino('')
  }

  const totais = useMemo(() => {
    let alocado = 0
    porRota.forEach((lista) => (alocado += lista.length))
    return { alocado, fila: fila.length, semRota: semRota.length }
  }, [porRota, fila, semRota])

  const indicadores = [
    {
      valor: executar.isPending ? '…' : String(totais.alocado),
      rotulo: 'alocados com sucesso',
      bg: '#EAF3EC',
      fg: '#2E7D5A',
      Icone: IconeCheck,
    },
    {
      valor: executar.isPending ? '…' : String(totais.fila),
      rotulo: 'fila de espera',
      bg: '#FBEEDA',
      fg: '#B8862B',
      Icone: IconeRelogio,
    },
    {
      valor: executar.isPending ? '…' : String(totais.semRota),
      rotulo: 'sem rota compatível',
      bg: '#FBECEC',
      fg: '#9E3E3E',
      Icone: IconeAlerta,
    },
  ]

  /** Vagas restantes por rota — usado para bloquear destinos lotados (RN03). */
  const vagas = useMemo(() => {
    const mapa = new Map<string, number>()
    rotasAtivas.forEach((o) => {
      mapa.set(o.rota_id, o.capacidade_maxima - (porRota.get(o.rota_id)?.length ?? 0))
    })
    return mapa
  }, [rotasAtivas, porRota])

  const rotaAtualDoSelecionado = selecionado?.rota_id ?? null

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Alocação</h1>
          <div className="mt-1 text-[13px] text-muted">
            Distribui estudantes nas rotas compatíveis com sua grade respeitando a capacidade
            dos veículos.
          </div>
        </div>
        <button
          onClick={() => executar.mutate()}
          disabled={executar.isPending}
          className="btn-primary shrink-0 px-[18px] py-2.5"
        >
          <span
            className="transition-transform duration-[1500ms]"
            style={{ transform: executar.isPending ? 'rotate(360deg)' : 'rotate(0deg)' }}
          >
            <IconeRecarregar size={15} />
          </span>
          {executar.isPending ? 'Processando…' : 'Executar alocação'}
        </button>
      </div>

      {resultado && (
        <div className="mb-4 rounded-card bg-tint px-4 py-2.5 font-mono text-[11.5px] text-muted">
          Última execução: {resultado.duracao_ms} ms · limite RNF03: 10.000 ms
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {indicadores.map(({ valor, rotulo, bg, fg, Icone }) => (
          <div key={rotulo} className="card flex items-center gap-3 p-4">
            <div
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
              style={{ background: bg, color: fg }}
            >
              <Icone size={18} />
            </div>
            <div>
              <div className="text-[22px] font-semibold">{valor}</div>
              <div className="text-[11.5px] text-muted">{rotulo}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {(isLoading || carregandoRotas) && <CarregandoCards itens={4} altura={78} />}

      {/* ---------------- Rotas ---------------- */}
      {ocupacoes && (
        <div className="card mb-3.5 p-[18px]">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="text-[14.5px] font-semibold">Rotas</div>
            <div className="text-[12px] text-muted">
              Clique em uma rota para ver os estudantes alocados
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {rotasAtivas.map((o) => (
              <CartaoRota
                key={o.rota_id}
                rota={o}
                alocados={porRota.get(o.rota_id) ?? []}
                aberta={abertas.has(o.rota_id)}
                grades={grades}
                onAlternar={() => alternarRota(o.rota_id)}
                onSelecionar={abrirCartao}
              />
            ))}

            {rotasAtivas.length === 0 && (
              <div className="py-8 text-center text-[12.5px] text-muted">
                Nenhuma rota ativa cadastrada.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Pendências ---------------- */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <ListaPendencia
          titulo="Fila de espera"
          descricao="Há rota compatível com a grade, mas o veículo está sem vaga."
          cor="#B8862B"
          itens={fila}
          onSelecionar={abrirCartao}
        />
        <ListaPendencia
          titulo="Sem rota compatível"
          descricao="Nenhuma rota atende a universidade e o horário de aulas."
          cor="#9E3E3E"
          itens={semRota}
          onSelecionar={abrirCartao}
        />
      </div>

      {/* ---------------- Cartão de ações do estudante ---------------- */}
      <Modal
        aberto={!!selecionado}
        titulo={selecionado?.estudante?.nome ?? 'Estudante'}
        descricao={
          selecionado
            ? `Prontuário ${selecionado.estudante?.prontuario ?? '-'} · ${
                selecionado.estudante?.curso ?? 'curso não informado'
              }`
            : undefined
        }
        largura={520}
        onFechar={fecharCartao}
        rodape={
          <>
            {rotaAtualDoSelecionado && (
              <button
                onClick={() =>
                  selecionado &&
                  mover.mutate({ estudanteId: selecionado.estudante_id, rotaId: null })
                }
                disabled={mover.isPending}
                className="btn-danger mr-auto"
              >
                Remover da rota
              </button>
            )}
            <button onClick={fecharCartao} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() =>
                selecionado &&
                mover.mutate({ estudanteId: selecionado.estudante_id, rotaId: rotaDestino })
              }
              disabled={!rotaDestino || mover.isPending}
              className="btn-primary"
            >
              {mover.isPending ? 'Salvando…' : rotaAtualDoSelecionado ? 'Trocar de rota' : 'Alocar na rota'}
            </button>
          </>
        }
      >
        {selecionado && (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3 rounded-btn bg-tint px-3.5 py-3">
              <Avatar nome={selecionado.estudante?.nome ?? '?'} tamanho={38} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{selecionado.estudante?.nome}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                  {grades?.get(selecionado.estudante_id) ?? 'sem grade horária'}
                </div>
              </div>
              <div className="shrink-0 text-right text-[11.5px]">
                <div className="text-soft">Situação atual</div>
                <div className="font-medium">
                  {selecionado.rota
                    ? selecionado.rota.codigo
                    : selecionado.situacao === 'sem_rota'
                      ? 'Sem rota'
                      : 'Fila de espera'}
                </div>
              </div>
            </div>

            {selecionado.motivo && (
              <div className="rounded-btn bg-tint px-3.5 py-2.5 text-[12px] text-muted">
                {selecionado.motivo}
              </div>
            )}

            <label>
              <span className="field-label">
                {rotaAtualDoSelecionado ? 'Nova rota' : 'Rota de destino'}
              </span>
              <select
                value={rotaDestino}
                onChange={(e) => setRotaDestino(e.target.value)}
                className="field"
              >
                <option value="">Selecione…</option>
                {rotasAtivas
                  .filter((o) => o.rota_id !== rotaAtualDoSelecionado)
                  .map((o) => {
                    const livres = vagas.get(o.rota_id) ?? 0
                    return (
                      <option key={o.rota_id} value={o.rota_id} disabled={livres <= 0}>
                        {o.codigo} · {o.nome} · {livres > 0 ? `${livres} vaga(s)` : 'sem vaga'}
                      </option>
                    )
                  })}
              </select>
              <span className="mt-1 block text-[11.5px] text-muted">
                O ajuste é marcado como manual e a próxima distribuição automática o preserva
                (RN10).
              </span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Card de rota que expande para baixo com os estudantes alocados. */
function CartaoRota({
  rota,
  alocados,
  aberta,
  grades,
  onAlternar,
  onSelecionar,
}: {
  rota: OcupacaoRota
  alocados: AlocacaoTipo[]
  aberta: boolean
  grades?: Map<string, string>
  onAlternar: () => void
  onSelecionar: (a: AlocacaoTipo) => void
}) {
  const pct = percentual(alocados.length, rota.capacidade_maxima)
  const restam = rota.capacidade_maxima - alocados.length

  return (
    <div className={`rounded-[10px] border transition-colors ${aberta ? 'border-primary/30 bg-panel' : 'border-line'}`}>
      <button
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left"
      >
        <span
          className="shrink-0 text-soft transition-transform"
          style={{ transform: aberta ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <IconeSeta size={15} />
        </span>

        <div className="w-[52px] shrink-0 font-mono text-[13px] font-semibold text-primary">
          {rota.codigo}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{rota.nome}</div>
          <div className="mt-px font-mono text-[11px] text-soft">
            {hora(rota.horario_partida)} → {hora(rota.horario_retorno)} · {rota.motorista}
          </div>
        </div>

        <div className="hidden w-[90px] shrink-0 sm:block">
          <ProgressBar percentual={pct} altura={5} />
        </div>

        <div className="w-[86px] shrink-0 text-right">
          <div className="font-mono text-[13px] font-semibold">
            {alocados.length}
            <span className="text-muted">/{rota.capacidade_maxima}</span>
          </div>
          <div
            className="text-[10.5px]"
            style={{ color: restam <= 0 ? '#9E3E3E' : pct >= 80 ? '#B8862B' : '#2E7D5A' }}
          >
            {restam > 0 ? `restam ${restam}` : 'sem vaga'}
          </div>
        </div>
      </button>

      {aberta && (
        <div className="border-t border-line px-3.5 py-3">
          {alocados.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-muted">
              Nenhum estudante alocado nesta rota.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {alocados.map((a) => (
                <LinhaEstudante
                  key={a.id}
                  alocacao={a}
                  detalhe={`${a.estudante?.curso ?? '—'} · ${
                    grades?.get(a.estudante_id) ?? 'sem grade'
                  }`}
                  onSelecionar={onSelecionar}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Fila de espera / sem rota compatível, listadas abaixo das rotas. */
function ListaPendencia({
  titulo,
  descricao,
  cor,
  itens,
  onSelecionar,
}: {
  titulo: string
  descricao: string
  cor: string
  itens: AlocacaoTipo[]
  onSelecionar: (a: AlocacaoTipo) => void
}) {
  return (
    <div className="card p-[18px]">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-[14.5px] font-semibold">{titulo}</div>
        <div className="font-mono text-[13px] font-semibold" style={{ color: cor }}>
          {itens.length}
        </div>
      </div>
      <p className="mb-3 text-[11.5px] text-muted">{descricao}</p>

      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
        {itens.map((a) => (
          <LinhaEstudante
            key={a.id}
            alocacao={a}
            detalhe={a.motivo ?? 'Aguardando vaga'}
            cor={cor}
            onSelecionar={onSelecionar}
          />
        ))}
        {itens.length === 0 && (
          <div className="py-6 text-center text-[11.5px] text-muted">Nenhuma pendência.</div>
        )}
      </div>
    </div>
  )
}

function LinhaEstudante({
  alocacao,
  detalhe,
  cor,
  onSelecionar,
}: {
  alocacao: AlocacaoTipo
  detalhe: string
  cor?: string
  onSelecionar: (a: AlocacaoTipo) => void
}) {
  const manual = alocacao.origem === 'manual'

  return (
    <button
      onClick={() => onSelecionar(alocacao)}
      className="flex items-center gap-2.5 rounded-field border border-edge bg-surface px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-bg"
      title="Abrir opções de alocação"
    >
      <span
        className="h-[26px] w-[5px] shrink-0 rounded-full"
        style={{ background: cor ?? (manual ? '#C4633A' : '#1F3A2E') }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{alocacao.estudante?.nome ?? '—'}</div>
        <div className="truncate text-[10.5px] text-soft">{detalhe}</div>
      </div>
      {manual && (
        <span className="shrink-0 font-mono text-3xs uppercase tracking-wide text-accent">man</span>
      )}
    </button>
  )
}
