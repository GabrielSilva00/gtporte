import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../lib/supabase'
import { DIAS_SEMANA, dataHoraBR } from '../lib/format'
import { useCidades, useUniversidades } from '../hooks/useCadastros'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeInfo } from '../components/icons'
import { ROTULO_PERFIL_USO } from '../lib/types'
import { gradeDeLinhas, type MapaGrade } from '../components/GradeSemanal'

type StatusAlteracao = 'pendente' | 'aprovada' | 'recusada'

const CAMPOS: Record<string, string> = {
  nome: 'Nome completo',
  telefone: 'Telefone',
  email: 'E-mail',
  curso: 'Curso',
  endereco: 'Endereço',
  data_nascimento: 'Data de nascimento',
  universidade_id: 'Universidade',
  cidade_id: 'Cidade',
  perfil_uso: 'Perfil de uso',
  periodo_tipo: 'Tipo de período',
  periodo_numero: 'Período do curso',
}

interface LinhaGrade {
  dia_semana: number
  hora_inicio: string
  hora_fim: string
}

interface AlteracaoGrade {
  id: string
  grade: LinhaGrade[]
  status: StatusAlteracao
  observacao: string | null
  criado_em: string
  revisado_em: string | null
  estudante: { id: string; nome: string; prontuario: string } | null
}

interface Alteracao {
  id: string
  campo: string
  valor_anterior: string | null
  valor_novo: string | null
  status: StatusAlteracao
  observacao: string | null
  criado_em: string
  revisado_em: string | null
  estudante: { id: string; nome: string; prontuario: string } | null
}

/**
 * RF22 — fila de alterações cadastrais enviadas pelo app do estudante.
 *
 * O estudante não altera mais o próprio cadastro direto: o que ele grava no
 * app entra aqui como pendente e só chega em `estudante` quando alguém da
 * secretaria aprova. A aplicação do valor acontece no banco, em
 * revisar_alteracao_cadastral() (migration 0016).
 */
export default function AlteracoesCadastrais() {
  const [aba, setAba] = useState<StatusAlteracao>('pendente')
  const [tipo, setTipo] = useState<'dados' | 'grade'>('dados')
  const [recusando, setRecusando] = useState<Alteracao | null>(null)
  const [motivo, setMotivo] = useState('')
  const qc = useQueryClient()
  const toast = useToast()
  const { data: cidades } = useCidades()
  const { data: universidades } = useUniversidades()

  const { data: pendentesGrade } = useQuery({
    queryKey: ['alteracoes-grade', 'contagem'],
    queryFn: async () => {
      const { count } = await supabase
        .from('alteracao_grade')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente')
      return count ?? 0
    },
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['alteracoes-cadastrais', aba],
    enabled: tipo === 'dados',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alteracao_cadastral')
        .select(
          'id,campo,valor_anterior,valor_novo,status,observacao,criado_em,revisado_em,estudante:estudante_id(id,nome,prontuario)',
        )
        .eq('status', aba)
        .order('criado_em', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Alteracao[]
    },
  })

  /** uuid e enum viram texto legível; o resto vai como veio. */
  const legivel = (campo: string, valor: string | null) => {
    if (valor === null || valor === '') return '—'
    if (campo === 'cidade_id') {
      const c = cidades?.find((x) => x.id === valor)
      return c ? `${c.nome}/${c.uf}` : valor
    }
    if (campo === 'universidade_id') {
      return universidades?.find((x) => x.id === valor)?.nome ?? valor
    }
    if (campo === 'perfil_uso') {
      return ROTULO_PERFIL_USO[valor as keyof typeof ROTULO_PERFIL_USO] ?? valor
    }
    if (campo === 'data_nascimento') {
      return new Date(`${valor}T00:00:00`).toLocaleDateString('pt-BR')
    }
    return valor
  }

  const revisar = useMutation({
    mutationFn: async (v: { id: string; aprovar: boolean; observacao?: string }) => {
      const { error } = await supabase.rpc('revisar_alteracao_cadastral', {
        p_id: v.id,
        p_aprovar: v.aprovar,
        p_observacao: v.observacao ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['alteracoes-cadastrais'] })
      qc.invalidateQueries({ queryKey: ['estudantes'] })
      toast.sucesso(v.aprovar ? 'Alteração aprovada e aplicada.' : 'Alteração recusada.')
      setRecusando(null)
      setMotivo('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="eyebrow mb-2">Administração</div>
      <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Alterações cadastrais</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Dados que os estudantes atualizaram pelo aplicativo e aguardam validação.
      </p>

      <div className="mt-5">
        <Tabs
          variante="pilulas"
          abas={[
            { chave: 'dados', rotulo: 'Dados cadastrais' },
            { chave: 'grade', rotulo: 'Grade de aulas', contador: pendentesGrade || undefined },
          ]}
          ativa={tipo}
          onMudar={setTipo}
          className="mb-3"
        />
        <Tabs
          abas={[
            { chave: 'pendente', rotulo: 'Pendentes' },
            { chave: 'aprovada', rotulo: 'Aprovadas' },
            { chave: 'recusada', rotulo: 'Recusadas' },
          ]}
          ativa={aba}
          onMudar={setAba}
        />
      </div>

      {tipo === 'grade' ? (
        <FilaGrade status={aba} />
      ) : isLoading ? (
        <CarregandoTabela />
      ) : error ? (
        <ErroCarregamento mensagem={mensagemErro(error)} />
      ) : !data || data.length === 0 ? (
        <Vazio
          titulo="Nada por aqui"
          descricao={
            aba === 'pendente'
              ? 'Nenhuma alteração aguardando validação.'
              : `Nenhuma alteração ${aba}.`
          }
        />
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">
                    {a.estudante?.nome ?? 'Estudante removido'}
                  </div>
                  <div className="text-[12px] text-muted">
                    Prontuário {a.estudante?.prontuario ?? '—'} · enviado em{' '}
                    {dataHoraBR(a.criado_em)}
                  </div>
                </div>
                <div className="eyebrow">{CAMPOS[a.campo] ?? a.campo}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-field bg-tint px-3 py-2.5">
                  <div className="text-[11px] text-muted">Valor atual</div>
                  <div className="text-[13px]">{legivel(a.campo, a.valor_anterior)}</div>
                </div>
                <div className="rounded-field border border-warn/40 bg-bg-warn px-3 py-2.5">
                  <div className="text-[11px] text-warn">Novo valor</div>
                  <div className="text-[13px] font-medium">{legivel(a.campo, a.valor_novo)}</div>
                </div>
              </div>

              {a.observacao && (
                <div className="mt-2.5 flex items-start gap-2 text-[12px] text-muted">
                  <span className="mt-px shrink-0 text-primary">
                    <IconeInfo size={14} />
                  </span>
                  {a.observacao}
                </div>
              )}

              {a.status === 'pendente' && (
                <div className="mt-3.5 flex gap-2">
                  <button
                    onClick={() => revisar.mutate({ id: a.id, aprovar: true })}
                    disabled={revisar.isPending}
                    className="btn-primary px-4 py-2 text-[12.5px]"
                  >
                    Aprovar e aplicar
                  </button>
                  <button
                    onClick={() => setRecusando(a)}
                    disabled={revisar.isPending}
                    className="btn-ghost px-4 py-2 text-[12.5px]"
                  >
                    Recusar
                  </button>
                </div>
              )}

              {a.status !== 'pendente' && a.revisado_em && (
                <div className="mt-2.5 text-[12px] text-muted">
                  Revisado em {dataHoraBR(a.revisado_em)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={!!recusando}
        titulo="Recusar alteração"
        onFechar={() => {
          setRecusando(null)
          setMotivo('')
        }}
      >
        <p className="mb-3 text-[13px] text-muted">
          O motivo aparece para o estudante no aplicativo, junto ao campo recusado.
        </p>
        <label className="block">
          <span className="field-label">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="field"
            placeholder="Ex.: telefone informado está incompleto."
          />
        </label>
        <button
          onClick={() =>
            recusando && revisar.mutate({ id: recusando.id, aprovar: false, observacao: motivo.trim() })
          }
          disabled={!motivo.trim() || revisar.isPending}
          className="btn-primary mt-4 w-full py-2.5"
        >
          Confirmar recusa
        </button>
      </Modal>
    </div>
  )
}

const fmtDia = (g?: { inicio: string; fim: string; ativo: boolean }) =>
  g?.ativo ? `${g.inicio} – ${g.fim}` : 'sem aula'

/**
 * Alterações de grade enviadas pelo app (alteracao_grade, migration 0021).
 * O estudante manda a grade inteira; aqui aparece dia a dia o que muda em
 * relação à grade vigente. Aprovar reescreve grade_horaria no banco
 * (revisar_alteracao_grade).
 */
function FilaGrade({ status }: { status: StatusAlteracao }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [recusando, setRecusando] = useState<AlteracaoGrade | null>(null)
  const [motivo, setMotivo] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['alteracoes-grade', status],
    queryFn: async () => {
      const { data: linhas, error: err } = await supabase
        .from('alteracao_grade')
        .select('id,grade,status,observacao,criado_em,revisado_em,estudante:estudante_id(id,nome,prontuario)')
        .eq('status', status)
        .order('criado_em', { ascending: false })
        .limit(200)
      if (err) throw err
      const lista = (linhas ?? []) as unknown as AlteracaoGrade[]

      // grade vigente de cada estudante, para mostrar o antes e o depois
      const ids = [...new Set(lista.map((a) => a.estudante?.id).filter(Boolean))] as string[]
      const vigentes = new Map<string, MapaGrade>()
      if (ids.length > 0) {
        const { data: gh } = await supabase
          .from('grade_horaria')
          .select('estudante_id,dia_semana,hora_inicio,hora_fim')
          .in('estudante_id', ids)
        for (const id of ids) {
          vigentes.set(id, gradeDeLinhas(((gh ?? []) as (LinhaGrade & { estudante_id: string })[]).filter((g) => g.estudante_id === id)))
        }
      }
      return lista.map((a) => ({ ...a, vigente: vigentes.get(a.estudante?.id ?? '') ?? gradeDeLinhas([]) }))
    },
  })

  const revisar = useMutation({
    mutationFn: async (v: { id: string; aprovar: boolean; observacao?: string }) => {
      const { error: err } = await supabase.rpc('revisar_alteracao_grade', {
        p_id: v.id,
        p_aprovar: v.aprovar,
        p_observacao: v.observacao ?? null,
      })
      if (err) throw err
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['alteracoes-grade'] })
      toast.sucesso(v.aprovar ? 'Grade aprovada e aplicada.' : 'Alteração de grade recusada.')
      setRecusando(null)
      setMotivo('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (isLoading) return <CarregandoTabela />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (!data || data.length === 0) {
    return (
      <Vazio
        titulo="Nada por aqui"
        descricao={
          status === 'pendente'
            ? 'Nenhuma grade aguardando validação.'
            : `Nenhuma alteração de grade ${status}.`
        }
      />
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {data.map((a) => {
        const proposta = gradeDeLinhas(a.grade ?? [])
        return (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">
                  {a.estudante?.nome ?? 'Estudante removido'}
                </div>
                <div className="text-[12px] text-muted">
                  Prontuário {a.estudante?.prontuario ?? '—'} · enviado em {dataHoraBR(a.criado_em)}
                </div>
              </div>
              <div className="eyebrow">Grade de aulas</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
              {DIAS_SEMANA.map((d) => {
                const antes = a.vigente[d.numero]
                const depois = proposta[d.numero]
                const mudou = fmtDia(antes) !== fmtDia(depois)
                return (
                  <div
                    key={d.numero}
                    className={`rounded-field px-2.5 py-2 ${
                      mudou ? 'border border-warn/40 bg-bg-warn' : 'bg-tint'
                    }`}
                  >
                    <div className={`text-[11px] ${mudou ? 'font-semibold text-warn' : 'text-muted'}`}>
                      {d.rotulo}
                    </div>
                    <div className="text-[12.5px] font-medium">{fmtDia(depois)}</div>
                    {mudou && (
                      <div className="text-[10.5px] text-muted line-through">{fmtDia(antes)}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {a.observacao && (
              <div className="mt-2.5 flex items-start gap-2 text-[12px] text-muted">
                <span className="mt-px shrink-0 text-primary">
                  <IconeInfo size={14} />
                </span>
                {a.observacao}
              </div>
            )}

            {a.status === 'pendente' && (
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => revisar.mutate({ id: a.id, aprovar: true })}
                  disabled={revisar.isPending}
                  className="btn-primary px-4 py-2 text-[12.5px]"
                >
                  Aprovar e aplicar
                </button>
                <button
                  onClick={() => setRecusando(a)}
                  disabled={revisar.isPending}
                  className="btn-ghost px-4 py-2 text-[12.5px]"
                >
                  Recusar
                </button>
              </div>
            )}

            {a.status !== 'pendente' && a.revisado_em && (
              <div className="mt-2.5 text-[12px] text-muted">Revisado em {dataHoraBR(a.revisado_em)}</div>
            )}
          </div>
        )
      })}

      <Modal
        aberto={!!recusando}
        titulo="Recusar alteração de grade"
        onFechar={() => {
          setRecusando(null)
          setMotivo('')
        }}
      >
        <p className="mb-3 text-[13px] text-muted">
          O motivo aparece para o estudante no aplicativo, junto à grade de aulas.
        </p>
        <label className="block">
          <span className="field-label">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="field"
            placeholder="Ex.: horário de sexta incompatível com a declaração de matrícula."
          />
        </label>
        <button
          onClick={() =>
            recusando && revisar.mutate({ id: recusando.id, aprovar: false, observacao: motivo.trim() })
          }
          disabled={!motivo.trim() || revisar.isPending}
          className="btn-primary mt-4 w-full py-2.5"
        >
          Confirmar recusa
        </button>
      </Modal>
    </div>
  )
}
