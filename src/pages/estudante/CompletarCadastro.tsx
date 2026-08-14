import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { useCidades, useUniversidades } from '../../hooks/useCadastros'
import { BUCKET_DOCUMENTOS, mensagemErro, supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'
import { IconeCheck, IconeInfo, IconeUpload } from '../../components/icons'
import { DIAS_SEMANA } from '../../lib/format'
import {
  GradeSemanal,
  gradeVazia,
  linhasDaGrade,
  type MapaGrade,
} from '../../components/GradeSemanal'
import {
  ROTULO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type PerfilUso,
  type TipoDocumento,
} from '../../lib/types'

/**
 * RF01 + RF02 — etapa 2 do cadastro: dados acadêmicos, grade horária e
 * envio dos quatro documentos obrigatórios.
 * Os documentos entram como pendentes e dependem de aprovação (RN01/RN07).
 */
export default function CompletarCadastro() {
  const { perfil, recarregar } = useAuth()
  const { data: universidades } = useUniversidades()
  const { data: cidades } = useCidades()
  const navegar = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    nome: perfil?.nome ?? '',
    cpf: '',
    data_nascimento: '',
    telefone: perfil?.telefone ?? '',
    curso: '',
    endereco: '',
    universidade_id: '',
    cidade_id: '',
    perfil_uso: 'ida_volta' as PerfilUso,
  })

  // Um horario por dia: nem todo curso tem a mesma carga de segunda a sabado.
  const [grade, setGrade] = useState<MapaGrade>(gradeVazia)
  const [arquivos, setArquivos] = useState<Partial<Record<TipoDocumento, File>>>({})

  const enviar = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error('Sessão expirada. Faça login novamente.')

      const { data: estudante, error: erroEstudante } = await supabase
        .from('estudante')
        .insert({
          perfil_id: perfil.id,
          nome: form.nome.trim(),
          cpf: form.cpf.trim(),
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone.trim() || null,
          email: perfil.email,
          curso: form.curso.trim() || null,
          endereco: form.endereco.trim() || null,
          universidade_id: form.universidade_id,
          cidade_id: form.cidade_id,
          perfil_uso: form.perfil_uso,
        })
        .select('id')
        .single()
      if (erroEstudante) throw erroEstudante

      // Grade horária — insumo da distribuição (RN02), um registro por dia com aula
      const linhas = linhasDaGrade(grade, estudante.id)
      if (linhas.length > 0) {
        const { error } = await supabase.from('grade_horaria').insert(linhas)
        if (error) throw error
      }

      // RF02 — upload para o bucket privado, uma pasta por estudante
      for (const tipo of TIPOS_DOCUMENTO) {
        const arquivo = arquivos[tipo]
        if (!arquivo) continue

        const extensao = arquivo.name.split('.').pop() ?? 'pdf'
        const caminho = `${estudante.id}/${tipo}-${Date.now()}.${extensao}`

        const { error: erroUpload } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
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
    },
    onSuccess: async () => {
      await recarregar()
      toast.sucesso('Cadastro enviado! Aguarde a validação dos documentos.')
      navegar('/estudante', { replace: true })
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const documentosEnviados = TIPOS_DOCUMENTO.filter((t) => arquivos[t]).length
  const diasMarcados = DIAS_SEMANA.filter((d) => grade[d.numero].ativo)
  const diasPreenchidos = diasMarcados.filter(
    (d) => grade[d.numero].inicio && grade[d.numero].fim,
  ).length
  const diasIncompletos = diasMarcados.length - diasPreenchidos
  const valido =
    form.nome.trim().length > 2 &&
    form.cpf.trim() !== '' &&
    form.universidade_id !== '' &&
    form.cidade_id !== '' &&
    diasPreenchidos > 0 &&
    diasIncompletos === 0

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="eyebrow mb-2">Cadastro de estudante</div>
      <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Complete seu cadastro</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Etapa 2 de 2, dados acadêmicos e documentos.
      </p>

      <div className="my-5 flex gap-2">
        <div className="h-[3px] flex-1 rounded-full bg-primary" />
        <div className="h-[3px] flex-1 rounded-full bg-primary" />
      </div>

      <section className="card mb-4 p-5">
        <div className="eyebrow mb-3.5">Dados pessoais</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="field-label">Nome completo</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">CPF</span>
            <input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              placeholder="000.000.000-00"
              className="field font-mono"
            />
          </label>
          <label>
            <span className="field-label">Data de nascimento</span>
            <input
              type="date"
              value={form.data_nascimento}
              onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Telefone</span>
            <input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="(18) 9 0000-0000"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Cidade onde mora</span>
            <select
              value={form.cidade_id}
              onChange={(e) => setForm({ ...form, cidade_id: e.target.value })}
              className="field"
            >
              <option value="">Selecione…</option>
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
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              placeholder="Rua, número, bairro"
              className="field"
            />
          </label>
        </div>
      </section>

      <section className="card mb-4 p-5">
        <div className="eyebrow mb-3.5">Dados acadêmicos</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="field-label">Curso</span>
            <input
              value={form.curso}
              onChange={(e) => setForm({ ...form, curso: e.target.value })}
              placeholder="Direito"
              className="field"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Universidade</span>
            <select
              value={form.universidade_id}
              onChange={(e) => setForm({ ...form, universidade_id: e.target.value })}
              className="field"
            >
              <option value="">Selecione…</option>
              {universidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="field-label">Perfil de uso do transporte</span>
            <select
              value={form.perfil_uso}
              onChange={(e) => setForm({ ...form, perfil_uso: e.target.value as PerfilUso })}
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
          <p className="mb-3 text-[12px] text-muted">
            Marque os dias em que você tem aula e informe o horário de cada um. É por aqui que o
            sistema encontra um ônibus compatível com a sua grade.
          </p>

          <GradeSemanal grade={grade} onChange={setGrade} />

          {diasIncompletos > 0 && (
            <p className="mt-2 text-[12px] text-warn">
              Informe início e término dos dias marcados.
            </p>
          )}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <div className="eyebrow mb-1.5">Documentos</div>
        <p className="mb-3.5 text-[12px] text-muted">
          Envie os quatro documentos. Você só é alocado em uma rota depois que o setor de
          transporte aprovar a documentação.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TIPOS_DOCUMENTO.map((tipo) => {
            const arquivo = arquivos[tipo]
            return (
              <label
                key={tipo}
                className={`flex cursor-pointer items-center gap-3 rounded-field border border-dashed px-3 py-3 transition-colors ${
                  arquivo ? 'border-success bg-bg-success' : 'border-edge hover:border-primary/40'
                }`}
              >
                <span className={arquivo ? 'text-success' : 'text-soft'}>
                  {arquivo ? <IconeCheck size={16} /> : <IconeUpload size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{ROTULO_DOCUMENTO[tipo]}</span>
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

        {documentosEnviados < 4 && (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
            <span className="mt-px shrink-0 text-primary">
              <IconeInfo size={15} />
            </span>
            Faltam {4 - documentosEnviados} documento(s). Você pode enviar os restantes depois, na
            aba <b>Documentos</b>, mas a alocação só acontece com todos aprovados.
          </div>
        )}
      </section>

      <button
        onClick={() => enviar.mutate()}
        disabled={!valido || enviar.isPending}
        className="btn-primary w-full py-3"
      >
        {enviar.isPending ? 'Enviando…' : 'Enviar cadastro'}
      </button>
    </div>
  )
}
