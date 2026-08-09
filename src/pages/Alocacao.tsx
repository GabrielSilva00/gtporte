import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOcupacaoRotas } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { hora, percentual } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import { IconeAlerta, IconeCheck, IconeRecarregar, IconeRelogio } from '../components/icons'
import type { Alocacao as AlocacaoTipo, ResultadoDistribuicao } from '../lib/types'

/**
 * RF09 (distribuição automática) e RF10 (ajuste manual).
 * A regra de negócio inteira roda no Postgres — ver executar_distribuicao()
 * e mover_alocacao_manual() em supabase/migrations/0003_funcoes.sql.
 */
export default function Alocacao() {
  const { data: ocupacoes, isLoading: carregandoRotas } = useOcupacaoRotas()
  const qc = useQueryClient()
  const toast = useToast()
  const [resultado, setResultado] = useState<ResultadoDistribuicao | null>(null)

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const { data: alocacoes, isLoading, error } = useQuery({
    queryKey: ['alocacoes-kanban'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('alocacao_estudante')
        .select(
          '*, estudante:estudante_id (id, nome, ra, curso, perfil_uso), rota:rota_id (id, codigo, nome)',
        )
        .eq('ativa', true)
      if (err) throw err
      return data as unknown as AlocacaoTipo[]
    },
  })

  // Horário de aulas por estudante — exibido no cartão do kanban
  const { data: grades } = useQuery({
    queryKey: ['grades-resumo'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('grade_horaria')
        .select('estudante_id, hora_inicio, hora_fim')
        .eq('dia_semana', 1)
      if (err) throw err
      return new Map(
        data.map((g) => [g.estudante_id, `${hora(g.hora_inicio)}–${hora(g.hora_fim)}`]),
      )
    },
  })

  const executar = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase.rpc('executar_distribuicao')
      if (err) throw err
      return data as ResultadoDistribuicao
    },
    onSuccess: (r) => {
      setResultado(r)
      r.mensagens.forEach((m) => toast.notificar(m.tipo, m.texto))
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
    onSuccess: () => {
      toast.sucesso('Alocação ajustada manualmente.')
      invalidar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['alocacoes-kanban'] })
    qc.invalidateQueries({ queryKey: ['alocacoes-ativas'] })
    qc.invalidateQueries({ queryKey: ['ocupacao-rotas'] })
    qc.invalidateQueries({ queryKey: ['contadores-nav'] })
    qc.invalidateQueries({ queryKey: ['dashboard-totais'] })
    qc.invalidateQueries({ queryKey: ['rotas'] })
  }

  const colunas = useMemo(() => {
    const porRota = new Map<string, AlocacaoTipo[]>()
    const semRota: AlocacaoTipo[] = []
    ;(alocacoes ?? []).forEach((a) => {
      if (a.rota_id && a.situacao === 'alocado') {
        const lista = porRota.get(a.rota_id) ?? []
        lista.push(a)
        porRota.set(a.rota_id, lista)
      } else {
        semRota.push(a)
      }
    })
    return { porRota, semRota }
  }, [alocacoes])

  const contagens = useMemo(() => {
    const c = { alocado: 0, fila_espera: 0, sem_rota: 0 }
    ;(alocacoes ?? []).forEach((a) => c[a.situacao]++)
    return c
  }, [alocacoes])

  function aoSoltar(evento: DragEndEvent) {
    const estudanteId = evento.active.data.current?.estudanteId as string | undefined
    const rotaAtual = evento.active.data.current?.rotaId as string | null | undefined
    const destino = evento.over?.id as string | undefined
    if (!estudanteId || !destino) return

    const rotaDestino = destino === 'fila' ? null : destino
    if (rotaDestino === (rotaAtual ?? null)) return

    mover.mutate({ estudanteId, rotaId: rotaDestino })
  }

  const cards = [
    {
      valor: executar.isPending ? '…' : String(resultado?.alocados ?? contagens.alocado),
      rotulo: 'alocados com sucesso',
      bg: '#EAF3EC',
      fg: '#2E7D5A',
      Icone: IconeCheck,
    },
    {
      valor: executar.isPending ? '…' : String(resultado?.fila_espera ?? contagens.fila_espera),
      rotulo: 'fila de espera',
      bg: '#FBEEDA',
      fg: '#B8862B',
      Icone: IconeRelogio,
    },
    {
      valor: executar.isPending ? '…' : String(resultado?.sem_rota ?? contagens.sem_rota),
      rotulo: 'sem rota compatível',
      bg: '#FBECEC',
      fg: '#9E3E3E',
      Icone: IconeAlerta,
    },
  ]

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Alocação</h1>
          <div className="mt-1 text-[13px] text-muted">
            Distribui estudantes nas rotas compatíveis com sua grade (RN02) respeitando a capacidade
            dos veículos (RN03).
          </div>
        </div>
        <button
          onClick={() => executar.mutate()}
          disabled={executar.isPending}
          className="btn-primary px-[18px] py-2.5"
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
        {cards.map(({ valor, rotulo, bg, fg, Icone }) => (
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
      {(isLoading || carregandoRotas) && <CarregandoCards itens={3} altura={280} />}

      {ocupacoes && (
        <div className="card p-[18px]">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="text-[14.5px] font-semibold">Distribuição por rota</div>
            <div className="text-[12px] text-muted">
              Arraste os cartões entre as colunas para ajuste manual (RF10)
            </div>
          </div>

          <DndContext sensors={sensores} onDragEnd={aoSoltar}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {ocupacoes
                .filter((o) => o.status !== 'inativa')
                .map((o) => {
                  const lista = colunas.porRota.get(o.rota_id) ?? []
                  const restam = o.capacidade_maxima - lista.length
                  return (
                    <Coluna
                      key={o.rota_id}
                      id={o.rota_id}
                      codigo={o.codigo}
                      nome={o.nome}
                      partida={hora(o.horario_partida)}
                      retorno={hora(o.horario_retorno)}
                      usados={lista.length}
                      capacidade={o.capacidade_maxima}
                      etiqueta={restam > 0 ? `restam ${restam}` : 'sem vaga'}
                      etiquetaCor={
                        restam <= 0 ? '#9E3E3E' : percentual(lista.length, o.capacidade_maxima) >= 80 ? '#B8862B' : '#2E7D5A'
                      }
                    >
                      {lista.map((a) => (
                        <Cartao
                          key={a.id}
                          alocacao={a}
                          detalhe={`${a.estudante?.curso ?? '—'} · ${
                            grades?.get(a.estudante_id) ?? 'sem grade'
                          }`}
                        />
                      ))}
                    </Coluna>
                  )
                })}

              {/* Coluna de pendências */}
              <Coluna
                id="fila"
                codigo="—"
                nome="Fila de espera / sem rota"
                partida="—"
                retorno="—"
                usados={colunas.semRota.length}
                capacidade={0}
                etiqueta="pendente"
                etiquetaCor="#B8862B"
              >
                {colunas.semRota.map((a) => (
                  <Cartao
                    key={a.id}
                    alocacao={a}
                    detalhe={a.motivo ?? 'Aguardando vaga'}
                    alerta
                  />
                ))}
                {colunas.semRota.length === 0 && (
                  <div className="py-6 text-center text-[11.5px] text-muted">
                    Nenhuma pendência.
                  </div>
                )}
              </Coluna>
            </div>
          </DndContext>
        </div>
      )}
    </div>
  )
}

interface ColunaProps {
  id: string
  codigo: string
  nome: string
  partida: string
  retorno: string
  usados: number
  capacidade: number
  etiqueta: string
  etiquetaCor: string
  children: React.ReactNode
}

function Coluna({
  id,
  codigo,
  nome,
  partida,
  retorno,
  usados,
  capacidade,
  etiqueta,
  etiquetaCor,
  children,
}: ColunaProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-[10px] border p-3 transition-colors ${
        isOver ? 'border-primary bg-tint' : 'border-line bg-panel'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-semibold text-primary">{codigo}</div>
          <div className="mt-0.5 truncate text-[12.5px] font-semibold">{nome}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-soft">
            {partida} → {retorno}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[13px] font-semibold">
            {usados}
            {capacidade > 0 && `/${capacidade}`}
          </div>
          <div className="text-[10px]" style={{ color: etiquetaCor }}>
            {etiqueta}
          </div>
        </div>
      </div>
      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">{children}</div>
    </div>
  )
}

function Cartao({
  alocacao,
  detalhe,
  alerta,
}: {
  alocacao: AlocacaoTipo
  detalhe: string
  alerta?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: alocacao.id,
    data: { estudanteId: alocacao.estudante_id, rotaId: alocacao.rota_id },
  })

  const manual = alocacao.origem === 'manual'
  const cor = alerta ? '#B8862B' : manual ? '#C4633A' : '#1F3A2E'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex cursor-grab items-center gap-2.5 rounded-field border border-edge bg-surface px-2.5 py-2 active:cursor-grabbing"
      title={manual ? 'Alocação manual — preservada na próxima execução (RN10)' : undefined}
    >
      <span className="h-[26px] w-[5px] shrink-0 rounded-full" style={{ background: cor }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium">{alocacao.estudante?.nome ?? '—'}</div>
        <div className="truncate text-[10.5px] text-soft">{detalhe}</div>
      </div>
      {manual && (
        <span className="shrink-0 font-mono text-3xs uppercase tracking-wide text-accent">man</span>
      )}
    </div>
  )
}
