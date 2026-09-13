import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useUniversidades } from '../hooks/useCadastros'
import { Modal } from '../components/ui/Modal'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeMais } from '../components/icons'

type Alcance = 'todos' | 'rota' | 'universidade'
type Prioridade = 'normal' | 'importante' | 'urgente'

interface Comunicado {
  id: string
  titulo: string
  corpo: string
  alcance: Alcance
  rota_id: string | null
  universidade_id: string | null
  prioridade: Prioridade
  publicado_em: string
  expira_em: string | null
  ativo: boolean
}

const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  normal: 'Normal',
  importante: 'Importante',
  urgente: 'Urgente',
}

/**
 * Canal da secretaria para os alunos (item 1 da Fase 3).
 *
 * Diferente de aviso_rota, que é do motorista e só alcança quem já está
 * alocado: aqui o alcance pode ser todos, uma rota ou uma universidade.
 * O recorte de quem recebe é resolvido em meus_comunicados() (0017).
 */
export default function Comunicados() {
  const { perfil } = useAuth()
  const { data: universidades } = useUniversidades()
  const qc = useQueryClient()
  const toast = useToast()

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    titulo: '',
    corpo: '',
    alcance: 'todos' as Alcance,
    rota_id: '',
    universidade_id: '',
    prioridade: 'normal' as Prioridade,
    expira_em: '',
  })

  const { data: rotas } = useQuery({
    queryKey: ['rotas-comunicado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota')
        .select('id,codigo,nome')
        .neq('status', 'inativa')
        .order('codigo')
      if (error) throw error
      return data as { id: string; codigo: string; nome: string }[]
    },
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['comunicados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comunicado')
        .select('id,titulo,corpo,alcance,rota_id,universidade_id,prioridade,publicado_em,expira_em,ativo')
        .order('publicado_em', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as Comunicado[]
    },
  })

  const publicar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('comunicado').insert({
        titulo: form.titulo.trim(),
        corpo: form.corpo.trim(),
        alcance: form.alcance,
        rota_id: form.alcance === 'rota' ? form.rota_id : null,
        universidade_id: form.alcance === 'universidade' ? form.universidade_id : null,
        prioridade: form.prioridade,
        expira_em: form.expira_em ? new Date(form.expira_em).toISOString() : null,
        autor_id: perfil?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comunicados'] })
      toast.sucesso('Comunicado publicado.')
      setModal(false)
      setForm({
        titulo: '',
        corpo: '',
        alcance: 'todos',
        rota_id: '',
        universidade_id: '',
        prioridade: 'normal',
        expira_em: '',
      })
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const arquivar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comunicado').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comunicados'] })
      toast.sucesso('Comunicado arquivado.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const alvo = (c: Comunicado) => {
    if (c.alcance === 'todos') return 'Todos os estudantes'
    if (c.alcance === 'rota') {
      const r = rotas?.find((x) => x.id === c.rota_id)
      return r ? `Rota ${r.codigo} — ${r.nome}` : 'Rota'
    }
    return universidades?.find((u) => u.id === c.universidade_id)?.nome ?? 'Universidade'
  }

  const valido =
    form.titulo.trim().length > 2 &&
    form.corpo.trim().length > 2 &&
    (form.alcance !== 'rota' || form.rota_id !== '') &&
    (form.alcance !== 'universidade' || form.universidade_id !== '')

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Comunicação</div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Comunicados</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Avisos da secretaria que aparecem na tela inicial do aplicativo do estudante.
          </p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary shrink-0 px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <IconeMais size={15} />
            Novo comunicado
          </span>
        </button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <CarregandoCards />
        ) : error ? (
          <ErroCarregamento mensagem={mensagemErro(error)} />
        ) : !data || data.length === 0 ? (
          <Vazio
            titulo="Nenhum comunicado"
            descricao="Publique um aviso para que ele apareça no aplicativo dos estudantes."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.map((c) => {
              const vencido = !!c.expira_em && new Date(c.expira_em) <= new Date()
              return (
                <div key={c.id} className={`card p-4 ${c.ativo && !vencido ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">{c.titulo}</div>
                      <div className="mt-0.5 text-[12px] text-muted">
                        {alvo(c)} · {dataHoraBR(c.publicado_em)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.prioridade !== 'normal' && (
                        <span className="eyebrow">{ROTULO_PRIORIDADE[c.prioridade]}</span>
                      )}
                      {!c.ativo ? (
                        <span className="eyebrow text-muted">Arquivado</span>
                      ) : vencido ? (
                        <span className="eyebrow text-muted">Expirado</span>
                      ) : (
                        <button
                          onClick={() => arquivar.mutate(c.id)}
                          disabled={arquivar.isPending}
                          className="btn-ghost px-3 py-1.5 text-[12px]"
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[13px] text-muted">{c.corpo}</p>
                  {c.expira_em && (
                    <p className="mt-2 text-[11.5px] text-muted">
                      Expira em {dataHoraBR(c.expira_em)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal aberto={modal} titulo="Novo comunicado" onFechar={() => setModal(false)}>
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="field-label">Título</span>
            <input
              className="field"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex.: Alteração no horário de retorno"
            />
          </label>

          <label className="block">
            <span className="field-label">Mensagem</span>
            <textarea
              className="field"
              rows={4}
              value={form.corpo}
              onChange={(e) => setForm({ ...form, corpo: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Quem recebe</span>
              <select
                className="field"
                value={form.alcance}
                onChange={(e) => setForm({ ...form, alcance: e.target.value as Alcance })}
              >
                <option value="todos">Todos os estudantes</option>
                <option value="rota">Uma rota</option>
                <option value="universidade">Uma universidade</option>
              </select>
            </label>

            <label className="block">
              <span className="field-label">Prioridade</span>
              <select
                className="field"
                value={form.prioridade}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}
              >
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>
          </div>

          {form.alcance === 'rota' && (
            <label className="block">
              <span className="field-label">Rota</span>
              <select
                className="field"
                value={form.rota_id}
                onChange={(e) => setForm({ ...form, rota_id: e.target.value })}
              >
                <option value="">Selecione…</option>
                {rotas?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} — {r.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          {form.alcance === 'universidade' && (
            <label className="block">
              <span className="field-label">Universidade</span>
              <select
                className="field"
                value={form.universidade_id}
                onChange={(e) => setForm({ ...form, universidade_id: e.target.value })}
              >
                <option value="">Selecione…</option>
                {universidades?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="field-label">Expira em (opcional)</span>
            <input
              type="datetime-local"
              className="field"
              value={form.expira_em}
              onChange={(e) => setForm({ ...form, expira_em: e.target.value })}
            />
            <span className="mt-1 block text-[11.5px] text-muted">
              Sem data, o comunicado fica no app até ser arquivado.
            </span>
          </label>

          <button
            onClick={() => publicar.mutate()}
            disabled={!valido || publicar.isPending}
            className="btn-primary mt-1 w-full py-2.5"
          >
            {publicar.isPending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
