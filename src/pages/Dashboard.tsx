import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useOcupacaoRotas } from '../hooks/useCadastros'
import { supabase, mensagemErro } from '../lib/supabase'
import { corOcupacao, dataExtenso, dataHoraBR, hora, numero, percentual } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import {
  IconeAlerta,
  IconeAlocacao,
  IconeChave,
  IconeDocumento,
  IconeEstudante,
  IconeRelogio,
  IconeRota,
  IconeVeiculo,
} from '../components/icons'
import {
  ROTULO_SITUACAO_OPERACIONAL,
  type Mensagem,
  type SituacaoOperacional,
} from '../lib/types'

/** Cores da situação operacional — mesma convenção do painel do motorista. */
const COR_SITUACAO: Record<SituacaoOperacional, { bg: string; fg: string }> = {
  aguardando: { bg: '#FBEEDA', fg: '#8A5A15' },
  em_rota: { bg: '#EAF3EC', fg: '#2E7D5A' },
  concluida: { bg: '#EEF1EF', fg: '#6B7570' },
}

export default function Dashboard() {
  const navegar = useNavigate()
  const { data: ocupacoes, isLoading, error } = useOcupacaoRotas()

  const { data: totais } = useQuery({
    queryKey: ['dashboard-totais'],
    queryFn: async () => {
      const [ativos, novos, docsPendentes, docs24h, emManutencao, pendencias] = await Promise.all([
        supabase
          .from('estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativo', true)
          .eq('status_documental', 'aprovado'),
        supabase
          .from('estudante')
          .select('id', { count: 'exact', head: true })
          .gte('criado_em', new Date(Date.now() - 30 * 864e5).toISOString()),
        supabase.from('documento').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase
          .from('documento')
          .select('id', { count: 'exact', head: true })
          .neq('status', 'pendente')
          .gte('revisado_em', new Date(Date.now() - 864e5).toISOString()),
        supabase.from('veiculo').select('placa').eq('status', 'manutencao'),
        supabase
          .from('alocacao_estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .in('situacao', ['fila_espera', 'sem_rota']),
      ])
      return {
        estudantesAtivos: ativos.count ?? 0,
        novosNoMes: novos.count ?? 0,
        docsPendentes: docsPendentes.count ?? 0,
        docsRevisados24h: docs24h.count ?? 0,
        veiculosManutencao: (emManutencao.data ?? []).map((v) => v.placa),
        pendenciasAlocacao: pendencias.count ?? 0,
      }
    },
  })

  // Últimas mensagens recebidas pelo setor (item do canal de comunicação)
  const { data: mensagens } = useQuery({
    queryKey: ['mensagens-recentes'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem')
        .select('*, remetente:remetente_id (id, nome, tipo)')
        .is('responde_a', null)
        .order('criado_em', { ascending: false })
        .limit(5)
      if (err) throw err
      return data as unknown as Mensagem[]
    },
    refetchInterval: 60_000,
  })

  const kpis = useMemo(() => {
    const rotasOperando = (ocupacoes ?? []).filter((o) => o.status === 'ativa' || o.status === 'lotada')
    const emRevisao = (ocupacoes ?? []).filter((o) => o.status === 'revisao').length
    const capacidadeTotal = rotasOperando.reduce((s, o) => s + o.capacidade_maxima, 0)
    const ocupacaoTotal = rotasOperando.reduce((s, o) => s + o.ocupacao, 0)

    return [
      {
        rotulo: 'Estudantes ativos',
        valor: numero(totais?.estudantesAtivos),
        Icone: IconeEstudante,
        tendencia: `+${numero(totais?.novosNoMes)}`,
        tendenciaCor: '#2E7D5A',
        tendenciaTexto: 'no mês',
      },
      {
        rotulo: 'Rotas em operação',
        valor: String(rotasOperando.length),
        Icone: IconeRota,
        tendencia: String(emRevisao),
        tendenciaCor: '#B8862B',
        tendenciaTexto: 'em revisão',
      },
      {
        rotulo: 'Ocupação média',
        valor: `${percentual(ocupacaoTotal, capacidadeTotal)}%`,
        Icone: IconeVeiculo,
        tendencia: `${ocupacaoTotal}`,
        tendenciaCor: '#6B7570',
        tendenciaTexto: `de ${capacidadeTotal} assentos`,
      },
      {
        rotulo: 'Docs. pendentes',
        valor: numero(totais?.docsPendentes),
        Icone: IconeDocumento,
        tendencia: `${totais?.docsRevisados24h ?? 0}`,
        tendenciaCor: '#2E7D5A',
        tendenciaTexto: 'revisados em 24h',
      },
    ]
  }, [ocupacoes, totais])

  // Alertas gerados a partir do estado real do sistema
  const alertas = useMemo(() => {
    const itens: {
      titulo: string
      descricao: string
      cor: string
      bg: string
      Icone: typeof IconeAlerta
    }[] = []

    const lotadas = (ocupacoes ?? []).filter(
      (o) => o.capacidade_maxima > 0 && o.ocupacao >= o.capacidade_maxima,
    )
    if (lotadas.length > 0) {
      itens.push({
        titulo: `${lotadas.map((l) => l.codigo).join(', ')} sem vaga`,
        descricao:
          totais?.pendenciasAlocacao
            ? `${totais.pendenciasAlocacao} estudante(s) aguardando realocação.`
            : 'Considere revisar a capacidade dos veículos.',
        cor: '#9E3E3E',
        bg: '#FCEEEC',
        Icone: IconeAlerta,
      })
    }

    if (totais?.docsPendentes) {
      itens.push({
        titulo: `${totais.docsPendentes} documento(s) pendentes`,
        descricao: 'Estudante só entra na distribuição após aprovação documental.',
        cor: '#B8862B',
        bg: '#FBEEDA',
        Icone: IconeRelogio,
      })
    }

    totais?.veiculosManutencao.forEach((placa) => {
      itens.push({
        titulo: `${placa} em manutenção`,
        descricao: 'Verifique se há rota vinculada a este veículo.',
        cor: '#6B7570',
        bg: '#EEF1EF',
        Icone: IconeChave,
      })
    })

    if (itens.length === 0) {
      itens.push({
        titulo: 'Nenhuma pendência',
        descricao: 'Frota, documentação e alocação estão em dia.',
        cor: '#2E7D5A',
        bg: '#EAF3EC',
        Icone: IconeAlocacao,
      })
    }

    return itens
  }, [ocupacoes, totais])

  const rotasOperando = (ocupacoes ?? [])
    .filter((o) => o.status !== 'inativa')
    .slice(0, 5)

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Visão geral</h1>
          <div className="mt-1 text-[13px] text-muted">{dataExtenso()}</div>
        </div>
        <button onClick={() => navegar('/alocacao')} className="btn-primary">
          <IconeAlocacao size={15} />
          Executar alocação
        </button>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ rotulo, valor, Icone, tendencia, tendenciaCor, tendenciaTexto }) => (
          <div key={rotulo} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-muted">{rotulo}</div>
              <span className="text-primary">
                <Icone size={17} />
              </span>
            </div>
            <div className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">{valor}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              <span className="font-medium" style={{ color: tendenciaCor }}>
                {tendencia}
              </span>{' '}
              {tendenciaTexto}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 xl:grid-cols-[1.5fr_1fr]">
        {/* Ocupação */}
        <div className="card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-[14.5px] font-semibold">Ocupação de hoje</div>
            <div className="text-[12px] text-muted">passageiros / capacidade</div>
          </div>

          {isLoading && <CarregandoCards itens={3} altura={38} />}

          <div className="flex flex-col gap-3.5">
            {(ocupacoes ?? []).map((o) => {
              const pct = percentual(o.ocupacao, o.capacidade_maxima)
              return (
                <div key={o.rota_id}>
                  <div className="mb-1.5 flex justify-between text-[12.5px]">
                    <div>
                      <span className="mr-2 font-mono text-muted">{o.codigo}</span>
                      {o.nome}
                    </div>
                    <div className="font-mono text-muted">
                      {o.ocupacao} / {o.capacidade_maxima}
                    </div>
                  </div>
                  <ProgressBar percentual={pct} />
                </div>
              )
            })}
            {ocupacoes?.length === 0 && (
              <div className="py-6 text-center text-[12.5px] text-muted">
                Nenhuma rota cadastrada ainda.
              </div>
            )}
          </div>
        </div>

        {/* Alertas */}
        <div className="card p-5">
          <div className="mb-3.5 text-[14.5px] font-semibold">Alertas</div>
          <div className="flex flex-col gap-2.5">
            {alertas.map(({ titulo, descricao, cor, bg, Icone }) => (
              <div key={titulo} className="flex gap-3 rounded-btn p-3" style={{ background: bg }}>
                <span className="mt-px shrink-0" style={{ color: cor }}>
                  <Icone size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{titulo}</div>
                  <div className="mt-0.5 text-[11.5px] leading-[1.45] text-muted">{descricao}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mensagens recebidas recentemente */}
      <div className="card mb-3.5 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-[14.5px] font-semibold">Mensagens recentes</div>
          <button
            onClick={() => navegar('/mensagens')}
            className="text-[12.5px] font-medium text-primary hover:text-primary-hover"
          >
            Ver todas →
          </button>
        </div>

        <div className="flex flex-col">
          {(mensagens ?? []).map((m) => (
            <button
              key={m.id}
              onClick={() => navegar(m.tipo === 'solicitacao' ? '/solicitacoes' : '/mensagens')}
              className="flex items-start gap-3 border-t border-line py-3 text-left transition-colors hover:bg-bg"
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
                  {m.tipo === 'solicitacao' && (
                    <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[10px] text-muted">
                      solicitação
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted">{m.corpo}</div>
              </div>
            </button>
          ))}

          {(mensagens ?? []).length === 0 && (
            <div className="border-t border-line py-8 text-center text-[12.5px] text-muted">
              Nenhuma mensagem recebida.
            </div>
          )}
        </div>
      </div>

      {/* Rotas em operação */}
      <div className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-[14.5px] font-semibold">Rotas em operação</div>
          <button
            onClick={() => navegar('/rotas')}
            className="text-[12.5px] font-medium text-primary hover:text-primary-hover"
          >
            Ver todas →
          </button>
        </div>

        {rotasOperando.map((o) => {
          const pct = percentual(o.ocupacao, o.capacidade_maxima)
          return (
            <div
              key={o.rota_id}
              className="grid grid-cols-[52px_1fr_130px_100px_90px] items-center gap-3.5 border-t border-line py-3"
            >
              <div className="font-mono text-[13px] font-semibold text-primary">{o.codigo}</div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{o.nome}</div>
                <div className="mt-px text-[11px] text-soft">{o.motorista}</div>
              </div>
              <div className="font-mono text-[12px] text-muted">
                {hora(o.horario_partida)} → {hora(o.horario_retorno)}
              </div>
              <div>
                <div className="font-mono text-[12px]">
                  {o.ocupacao} / {o.capacidade_maxima}
                </div>
                <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-tint">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: corOcupacao(pct) }}
                  />
                </div>
              </div>
              <div className="justify-self-end">
                <Badge
                  estilo={{
                    rotulo: ROTULO_SITUACAO_OPERACIONAL[o.situacao_operacional].toUpperCase(),
                    ...COR_SITUACAO[o.situacao_operacional],
                  }}
                  mono
                />
              </div>
            </div>
          )
        })}

        {rotasOperando.length === 0 && !isLoading && (
          <div className="border-t border-line py-8 text-center text-[12.5px] text-muted">
            Nenhuma rota em operação.
          </div>
        )}
      </div>
    </div>
  )
}
