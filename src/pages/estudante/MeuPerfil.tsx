import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { useCidades, useUniversidades } from '../../hooks/useCadastros'
import { mensagemErro, supabase } from '../../lib/supabase'
import { CarregandoCards, ErroCarregamento } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeInfo } from '../../components/icons'
import { DIAS_SEMANA, type DiaGrade } from '../../lib/format'
import { ROTULO_PERFIL_USO, type Estudante, type PerfilUso } from '../../lib/types'

interface LinhaGrade {
  dia_semana: number
  hora_inicio: string
  hora_fim: string
}

/** RF22 — atualização cadastral pelo próprio estudante. */
export default function MeuPerfil() {
  const { estudanteId, perfil } = useAuth()
  const { data: universidades } = useUniversidades()
  const { data: cidades } = useCidades()
  const qc = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState({
    telefone: '',
    endereco: '',
    curso: '',
    universidade_id: '',
    cidade_id: '',
    perfil_uso: 'ida_volta' as PerfilUso,
  })

  const [grade, setGrade] = useState<Record<number, DiaGrade>>(() =>
    Object.fromEntries(DIAS_SEMANA.map((d) => [d.numero, { ativo: false, inicio: '', fim: '' }])),
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['meu-cadastro', estudanteId],
    enabled: !!estudanteId,
    queryFn: async () => {
      const [est, grade] = await Promise.all([
        supabase.from('estudante').select('*').eq('id', estudanteId!).single(),
        supabase
          .from('grade_horaria')
          .select('dia_semana, hora_inicio, hora_fim')
          .eq('estudante_id', estudanteId!),
      ])
      if (est.error) throw est.error
      return {
        estudante: est.data as Estudante,
        grade: (grade.data ?? []) as LinhaGrade[],
      }
    },
  })

  useEffect(() => {
    if (!data) return
    const e = data.estudante
    setForm({
      telefone: e.telefone ?? '',
      endereco: e.endereco ?? '',
      curso: e.curso ?? '',
      universidade_id: e.universidade_id,
      cidade_id: e.cidade_id,
      perfil_uso: e.perfil_uso,
    })

    setGrade(
      Object.fromEntries(
        DIAS_SEMANA.map((d) => {
          const linha = data.grade.find((g) => g.dia_semana === d.numero)
          return [
            d.numero,
            {
              ativo: !!linha,
              inicio: linha?.hora_inicio?.slice(0, 5) ?? '',
              fim: linha?.hora_fim?.slice(0, 5) ?? '',
            },
          ]
        }),
      ),
    )
  }, [data])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!estudanteId) throw new Error('Cadastro não encontrado.')

      const { error: err } = await supabase
        .from('estudante')
        .update({
          telefone: form.telefone.trim() || null,
          endereco: form.endereco.trim() || null,
          curso: form.curso.trim() || null,
          universidade_id: form.universidade_id,
          cidade_id: form.cidade_id,
          perfil_uso: form.perfil_uso,
        })
        .eq('id', estudanteId)
      if (err) throw err

      const linhas = DIAS_SEMANA.filter((d) => {
        const g = grade[d.numero]
        return g.ativo && g.inicio && g.fim
      }).map((d) => ({
        estudante_id: estudanteId,
        dia_semana: d.numero,
        hora_inicio: grade[d.numero].inicio,
        hora_fim: grade[d.numero].fim,
      }))

      // A grade e reescrita por inteiro: dia desmarcado deixa de existir.
      await supabase.from('grade_horaria').delete().eq('estudante_id', estudanteId)
      if (linhas.length > 0) {
        const { error: erroGrade } = await supabase.from('grade_horaria').insert(linhas)
        if (erroGrade) throw erroGrade
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meu-cadastro'] })
      qc.invalidateQueries({ queryKey: ['minha-rota'] })
      toast.sucesso('Dados atualizados. A nova grade vale na próxima distribuição.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (isLoading) return <CarregandoCards itens={2} altura={200} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (!data) return null

  const e = data.estudante

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Meus dados</h1>
        <div className="mt-1 text-[13px] text-muted">
          Mantenha seu horário de aulas atualizado, é o que define sua rota.
        </div>
      </div>

      <div className="card mb-4 p-5">
        <div className="eyebrow mb-3.5">Dados fixos</div>
        <div className="grid grid-cols-1 gap-4 text-[13px] sm:grid-cols-3">
          <div>
            <div className="text-[11.5px] text-muted">Nome</div>
            <div className="mt-0.5 font-medium">{e.nome}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Prontuário</div>
            <div className="mt-0.5 font-mono">{e.prontuario}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">CPF</div>
            <div className="mt-0.5 font-mono">{e.cpf}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">E-mail</div>
            <div className="mt-0.5 truncate">{perfil?.email ?? e.email ?? '-'}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Perfil de uso atual</div>
            <div className="mt-0.5">{ROTULO_PERFIL_USO[e.perfil_uso]}</div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          Nome, prontuário e CPF constam nos documentos já validados. Para corrigi-los, procure o setor de
          transporte.
        </div>
      </div>

      <div className="card mb-4 p-5">
        <div className="eyebrow mb-3.5">Dados editáveis</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="field-label">Telefone</span>
            <input
              value={form.telefone}
              onChange={(f) => setForm({ ...form, telefone: f.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Curso</span>
            <input
              value={form.curso}
              onChange={(f) => setForm({ ...form, curso: f.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Universidade</span>
            <select
              value={form.universidade_id}
              onChange={(f) => setForm({ ...form, universidade_id: f.target.value })}
              className="field"
            >
              {universidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Cidade onde mora</span>
            <select
              value={form.cidade_id}
              onChange={(f) => setForm({ ...form, cidade_id: f.target.value })}
              className="field"
            >
              {cidades?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}/{c.uf}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Endereço</span>
            <input
              value={form.endereco}
              onChange={(f) => setForm({ ...form, endereco: f.target.value })}
              className="field"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Perfil de uso</span>
            <select
              value={form.perfil_uso}
              onChange={(f) => setForm({ ...form, perfil_uso: f.target.value as PerfilUso })}
              className="field"
            >
              <option value="ida_volta">Ida e volta</option>
              <option value="somente_ida">Somente ida</option>
              <option value="somente_volta">Somente volta</option>
            </select>
          </label>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="field-label">Horário das aulas</div>
          <div className="mt-2 flex flex-col gap-2">
            {DIAS_SEMANA.map((d) => {
              const g = grade[d.numero]
              return (
                <div
                  key={d.numero}
                  className={`grid grid-cols-[104px_1fr_1fr] items-center gap-2 rounded-field border px-3 py-2 transition-colors ${
                    g.ativo ? 'border-primary/30 bg-panel' : 'border-edge'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium">
                    <input
                      type="checkbox"
                      checked={g.ativo}
                      onChange={(f) =>
                        setGrade({ ...grade, [d.numero]: { ...g, ativo: f.target.checked } })
                      }
                      className="h-3.5 w-3.5 accent-[#1F3A2E]"
                    />
                    {d.rotulo}
                  </label>
                  <input
                    type="time"
                    aria-label={`Início das aulas de ${d.rotulo}`}
                    value={g.inicio}
                    disabled={!g.ativo}
                    onChange={(f) =>
                      setGrade({ ...grade, [d.numero]: { ...g, inicio: f.target.value } })
                    }
                    className="field py-1.5 text-[12.5px] disabled:opacity-40"
                  />
                  <input
                    type="time"
                    aria-label={`Término das aulas de ${d.rotulo}`}
                    value={g.fim}
                    disabled={!g.ativo}
                    onChange={(f) =>
                      setGrade({ ...grade, [d.numero]: { ...g, fim: f.target.value } })
                    }
                    className="field py-1.5 text-[12.5px] disabled:opacity-40"
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
        className="btn-primary w-full py-3"
      >
        {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  )
}
