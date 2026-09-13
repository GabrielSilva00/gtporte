import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, Send, Upload } from 'lucide-react'
import { erroMsg, supabase } from '@/lib/supabase'
import { useCadastros } from '@/hooks/useCadastros'
import { ROTULO_DOC, TIPOS_DOC, type TipoDoc } from '@/hooks/useEstudante'
import {
  GradeSemanal,
  diasInvalidos,
  gradeVazia,
  linhasDaGrade,
  type MapaGrade,
} from '@/components/GradeSemanal'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'
import type { Perfil } from '@/hooks/useAuth'

type PerfilUso = 'ida_volta' | 'somente_ida' | 'somente_volta'

/**
 * RF01 + RF02 — etapa que faltava no app: sem o registro em `estudante`
 * as telas de documentos, historico e perfil nao tem o que mostrar.
 *
 * Mesma gravacao de src/pages/estudante/CompletarCadastro.tsx do painel
 * web (estudante -> grade_horaria -> documentos), dividida em tres passos
 * para caber no celular.
 */
export function CompletarCadastro({ perfil, onPronto }: { perfil: Perfil; onPronto: () => void }) {
  const { cidades, universidades, loading } = useCadastros()
  const [passo, setPasso] = useState(0)
  const [enviando, setEnviando] = useState(false)

  const [form, setForm] = useState({
    nome: perfil.nome ?? '',
    cpf: '',
    data_nascimento: '',
    telefone: perfil.telefone ?? '',
    curso: '',
    endereco: '',
    universidade_id: '',
    cidade_id: '',
    perfil_uso: 'ida_volta' as PerfilUso,
  })
  const [grade, setGrade] = useState<MapaGrade>(gradeVazia)
  const [arquivos, setArquivos] = useState<Partial<Record<TipoDoc, File>>>({})

  const mudar = (campo: keyof typeof form, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))

  const invalidos = diasInvalidos(grade)
  const diasOk = linhasDaGrade(grade, 'x').length
  const passo1Ok =
    form.nome.trim().length > 2 && form.cpf.trim() !== '' && form.cidade_id !== ''
  const passo2Ok = form.universidade_id !== '' && diasOk > 0 && invalidos.length === 0

  const enviar = async () => {
    setEnviando(true)
    try {
      const { data: estudante, error: erroEstudante } = await supabase
        .from('estudante')
        .insert({
          perfil_id: perfil.id,
          nome: form.nome.trim(),
          cpf: form.cpf.trim(),
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone.trim() || null,
          email: perfil.email ?? null,
          curso: form.curso.trim() || null,
          endereco: form.endereco.trim() || null,
          universidade_id: form.universidade_id,
          cidade_id: form.cidade_id,
          perfil_uso: form.perfil_uso,
        })
        .select('id')
        .single()
      if (erroEstudante) throw erroEstudante

      const linhas = linhasDaGrade(grade, estudante.id)
      if (linhas.length > 0) {
        const { error } = await supabase.from('grade_horaria').insert(linhas)
        if (error) throw error
      }

      // RF02 — bucket privado, uma pasta por estudante.
      for (const tipo of TIPOS_DOC) {
        const arquivo = arquivos[tipo]
        if (!arquivo) continue

        const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        const caminho = `${estudante.id}/${tipo}-${Date.now()}.${extensao}`

        const { error: erroUpload } = await supabase.storage
          .from('documentos')
          .upload(caminho, arquivo, { upsert: true })
        if (erroUpload) throw erroUpload

        const { error: erroDoc } = await supabase.from('documento').insert({
          estudante_id: estudante.id,
          tipo,
          nome_arquivo: arquivo.name,
          storage_path: caminho,
          status: 'pendente',
        })
        if (erroDoc) throw erroDoc
      }

      toast('Cadastro enviado! Aguarde a validação dos documentos.')
      onPronto()
    } catch (e) {
      toast(erroMsg(e), 'err')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const enviados = TIPOS_DOC.filter((t) => arquivos[t]).length

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">
        Cadastro de estudante
      </p>
      <h1 className="mt-1 text-xl font-bold">Complete seu cadastro</h1>
      <p className="mt-1 text-sm text-muted">
        Passo {passo + 1} de 3. Sem isso o sistema não consegue alocar você em uma rota.
      </p>

      <div className="my-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= passo ? 'bg-brand-500' : 'bg-line'}`}
          />
        ))}
      </div>

      {passo === 0 && (
        <section className="card anim-in space-y-3">
          <h2 className="text-sm font-semibold">Dados pessoais</h2>
          <Campo rotulo="Nome completo">
            <input className="field" value={form.nome} onChange={(e) => mudar('nome', e.target.value)} />
          </Campo>
          <Campo rotulo="CPF">
            <input
              className="field font-mono"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(e) => mudar('cpf', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Data de nascimento">
            <input
              type="date"
              className="field"
              value={form.data_nascimento}
              onChange={(e) => mudar('data_nascimento', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Telefone">
            <input
              className="field"
              placeholder="(18) 9 0000-0000"
              value={form.telefone}
              onChange={(e) => mudar('telefone', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Cidade onde mora">
            <select className="field" value={form.cidade_id} onChange={(e) => mudar('cidade_id', e.target.value)}>
              <option value="">Selecione…</option>
              {cidades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}/{c.uf}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Endereço">
            <input
              className="field"
              placeholder="Rua, número, bairro"
              value={form.endereco}
              onChange={(e) => mudar('endereco', e.target.value)}
            />
          </Campo>
        </section>
      )}

      {passo === 1 && (
        <section className="card anim-in space-y-3">
          <h2 className="text-sm font-semibold">Dados acadêmicos</h2>
          <Campo rotulo="Curso">
            <input
              className="field"
              placeholder="Direito"
              value={form.curso}
              onChange={(e) => mudar('curso', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Universidade">
            <select
              className="field"
              value={form.universidade_id}
              onChange={(e) => mudar('universidade_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {universidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Perfil de uso do transporte">
            <select
              className="field"
              value={form.perfil_uso}
              onChange={(e) => mudar('perfil_uso', e.target.value)}
            >
              <option value="ida_volta">Ida e volta</option>
              <option value="somente_ida">Somente ida</option>
              <option value="somente_volta">Somente volta</option>
            </select>
          </Campo>

          <div className="border-t border-line/60 pt-3">
            <p className="text-xs font-medium text-muted">Horário das aulas</p>
            <p className="mb-3 mt-1 text-[11px] text-faint">
              Marque os dias em que você tem aula. É por aqui que o sistema encontra um ônibus
              compatível com a sua grade.
            </p>
            <GradeSemanal grade={grade} onChange={setGrade} />
            {diasOk === 0 && (
              <p className="mt-2 text-[11px] text-warn">Marque ao menos um dia com aula.</p>
            )}
          </div>
        </section>
      )}

      {passo === 2 && (
        <section className="card anim-in space-y-3">
          <h2 className="text-sm font-semibold">Documentos</h2>
          <p className="text-xs text-muted">
            Envie os quatro documentos. A alocação em uma rota só acontece depois que a secretaria
            aprovar a documentação.
          </p>

          <div className="space-y-2">
            {TIPOS_DOC.map((tipo) => {
              const arquivo = arquivos[tipo]
              return (
                <label
                  key={tipo}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 transition-colors ${
                    arquivo ? 'border-ok/50 bg-ok/5' : 'border-line'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      arquivo ? 'bg-ok/10 text-ok' : 'bg-raised text-faint'
                    }`}
                  >
                    {arquivo ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{ROTULO_DOC[tipo]}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {arquivo ? arquivo.name : 'PDF, JPG ou PNG'}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setArquivos((a) => ({ ...a, [tipo]: f }))
                    }}
                  />
                </label>
              )
            })}
          </div>

          {enviados < 4 && (
            <div className="aviso-info">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <p className="text-xs text-muted">
                Faltam {4 - enviados} documento(s). Você pode enviar o restante depois, na aba
                <b className="text-ink"> Docs</b>, mas a alocação só acontece com todos aprovados.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="mt-5 flex gap-3">
        {passo > 0 && (
          <button onClick={() => setPasso((p) => p - 1)} className="btn-outline flex items-center justify-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        )}
        {passo < 2 ? (
          <button
            onClick={() => setPasso((p) => p + 1)}
            disabled={passo === 0 ? !passo1Ok : !passo2Ok}
            className="btn-primary flex items-center justify-center gap-2"
          >
            Continuar
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={enviar}
            disabled={enviando || !passo1Ok || !passo2Ok}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {enviando ? <Spinner /> : (
              <>
                <Send className="h-4 w-4" />
                Enviar cadastro
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{rotulo}</span>
      {children}
    </label>
  )
}
