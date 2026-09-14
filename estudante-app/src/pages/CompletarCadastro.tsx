import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, Send, SkipForward, Upload } from 'lucide-react'
import { erroMsg, supabase } from '@/lib/supabase'
import { useCadastros } from '@/hooks/useCadastros'
import { ROTULO_DOC, TIPOS_DOC, type TipoDoc } from '@/hooks/useEstudante'
import { REGRAS_SENHA, validarSenha } from '@/lib/validarSenha'
import { cpfValido, mascaraCPF } from '@/lib/cpf'
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

/** Ano vai ate 6 (medicina), semestre ate 12 — o mesmo limite do banco. */
const LIMITE_PERIODO = { ano: 6, semestre: 12 } as const
type TipoPeriodo = keyof typeof LIMITE_PERIODO

/**
 * RF01 + RF02 — cadastro do estudante.
 *
 * Dois modos:
 *  - 'completar': ja existe conta (o usuario esta logado) e falta apenas
 *    o registro em `estudante`. Sao 3 passos.
 *  - 'novo': ninguem logado. O ultimo passo coleta e-mail e senha, cria a
 *    conta e so entao grava o cadastro.
 *
 * Grade horaria e opcional e basta um documento para concluir; em troca,
 * o acesso fica parcial ate a secretaria aprovar a documentacao.
 */
export function CompletarCadastro({
  perfil,
  modo = 'completar',
  onPronto,
  onCancelar,
  onSair,
}: {
  perfil?: Perfil
  modo?: 'completar' | 'novo'
  onPronto: () => void
  /** Modo 'novo': desiste do cadastro e volta para o Login. */
  onCancelar?: () => void
  /** Modo 'completar': encerra a sessao e volta para o Login. */
  onSair?: () => void
}) {
  const { cidades, universidades, loading } = useCadastros()
  const [passo, setPasso] = useState(0)
  const [enviando, setEnviando] = useState(false)

  const ultimoPasso = modo === 'novo' ? 3 : 2
  const totalPassos = ultimoPasso + 1

  const [form, setForm] = useState({
    nome: perfil?.nome ?? '',
    cpf: '',
    data_nascimento: '',
    telefone: perfil?.telefone ?? '',
    curso: '',
    endereco: '',
    cidade_universidade_id: '',
    universidade_id: '',
    periodo_tipo: 'semestre' as TipoPeriodo,
    periodo_numero: '',
    cidade_id: '',
    perfil_uso: 'ida_volta' as PerfilUso,
    email: perfil?.email ?? '',
    senha: '',
    senha2: '',
  })
  const [grade, setGrade] = useState<MapaGrade>(gradeVazia)
  const [arquivos, setArquivos] = useState<Partial<Record<TipoDoc, File>>>({})

  const mudar = (campo: keyof typeof form, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  // O campo Universidade so mostra as da cidade escolhida.
  const universidadesFiltradas = useMemo(
    () =>
      form.cidade_universidade_id
        ? universidades.filter((u) => u.cidade_id === form.cidade_universidade_id)
        : universidades,
    [universidades, form.cidade_universidade_id],
  )

  const invalidos = diasInvalidos(grade)
  const enviados = TIPOS_DOC.filter((t) => arquivos[t]).length
  const senhaOk = validarSenha(form.senha)

  const cpfOk = cpfValido(form.cpf)
  const passo1Ok = form.nome.trim().length > 2 && cpfOk && form.cidade_id !== ''
  // Grade horaria deixou de travar o avanco: so nao pode ficar pela metade.
  const passo2Ok = form.universidade_id !== '' && invalidos.length === 0
  const passo3Ok = true // documentos podem ficar para depois
  const passo4Ok =
    form.email.trim() !== '' && senhaOk.valida && form.senha === form.senha2

  const podeAvancar = passo === 0 ? passo1Ok : passo === 1 ? passo2Ok : passo3Ok

  /**
   * Grava estudante, grade e documentos. Assume sessao ativa.
   *
   * Se uma tentativa anterior criou o estudante e parou no meio (upload
   * falhou, conexao caiu), o registro ficou la: repetir o insert bateria
   * em `cpf` e `perfil_id`, que sao unique, e o aluno ficaria travado
   * sem entender. Entao reaproveitamos o cadastro existente.
   */
  const gravarCadastro = async (perfilId: string, email: string | null) => {
    const { data: existente } = await supabase
      .from('estudante')
      .select('id')
      .eq('perfil_id', perfilId)
      .maybeSingle()

    if (existente) {
      await enviarDocumentos(existente.id)
      return
    }

    const { data: estudante, error: erroEstudante } = await supabase
      .from('estudante')
      .insert({
        perfil_id: perfilId,
        nome: form.nome.trim(),
        cpf: form.cpf.trim(),
        data_nascimento: form.data_nascimento || null,
        telefone: form.telefone.trim() || null,
        email,
        curso: form.curso.trim() || null,
        endereco: form.endereco.trim() || null,
        universidade_id: form.universidade_id,
        cidade_id: form.cidade_id,
        periodo_tipo: form.periodo_numero ? form.periodo_tipo : null,
        periodo_numero: form.periodo_numero ? Number(form.periodo_numero) : null,
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

    await enviarDocumentos(estudante.id)
  }

  /** RF02 — bucket privado, uma pasta por estudante. */
  const enviarDocumentos = async (estudanteId: string) => {
    for (const tipo of TIPOS_DOC) {
      const arquivo = arquivos[tipo]
      if (!arquivo) continue

      const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const caminho = `${estudanteId}/${tipo}-${Date.now()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from('documentos')
        .upload(caminho, arquivo, { upsert: true })
      if (erroUpload) throw erroUpload

      // upsert: reenviar o mesmo tipo substitui, nao duplica
      const { error: erroDoc } = await supabase.from('documento').upsert(
        {
          estudante_id: estudanteId,
          tipo,
          nome_arquivo: arquivo.name,
          storage_path: caminho,
          status: 'pendente',
        },
        { onConflict: 'estudante_id,tipo' },
      )
      if (erroDoc) throw erroDoc
    }
  }

  const concluir = async () => {
    setEnviando(true)
    try {
      if (modo === 'novo') {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.senha,
          options: { data: { nome: form.nome.trim(), telefone: form.telefone.trim() || null, tipo: 'estudante' } },
        })
        if (error) {
          throw new Error(
            error.message.includes('already registered')
              ? 'Já existe uma conta com este e-mail.'
              : error.message,
          )
        }
        // Sem sessao, o projeto exige confirmacao de e-mail: o cadastro
        // nao pode ser gravado agora porque a RLS depende de auth.uid().
        if (!data.session || !data.user) {
          toast('Conta criada! Confirme o e-mail e entre para concluir o cadastro.')
          onPronto()
          return
        }
        await gravarCadastro(data.user.id, form.email.trim())
      } else {
        if (!perfil) throw new Error('Sessão expirada. Entre novamente.')
        await gravarCadastro(perfil.id, perfil.email ?? null)
      }

      toast(
        enviados === 4
          ? 'Cadastro enviado! Aguarde a validação dos documentos.'
          : enviados === 0
            ? 'Cadastro criado! Envie seus documentos na aba Docs.'
            : 'Cadastro enviado! Envie os documentos restantes na aba Docs.',
      )
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

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">
            Cadastro de estudante
          </p>
          <h1 className="mt-1 text-xl font-bold">
            {modo === 'novo' ? 'Criar sua conta' : 'Complete seu cadastro'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Passo {passo + 1} de {totalPassos}.
          </p>
        </div>
        {onCancelar ? (
          <button onClick={onCancelar} className="shrink-0 text-xs text-muted underline">
            Já tenho conta
          </button>
        ) : onSair ? (
          <button onClick={onSair} className="shrink-0 text-xs text-muted underline">
            Sair
          </button>
        ) : null}
      </div>

      <div className="my-4 flex gap-1.5">
        {Array.from({ length: totalPassos }, (_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= passo ? 'bg-brand-500' : 'bg-line'}`} />
        ))}
      </div>

      {passo === 0 && (
        <section className="card anim-in space-y-2.5">
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
              onChange={(e) => mudar('cpf', mascaraCPF(e.target.value))}
            />
            {form.cpf.length >= 14 && !cpfOk && (
              <span className="mt-1 block text-[11px] text-err">
                CPF inválido. Confira os números digitados.
              </span>
            )}
          </Campo>
          <div className="grid grid-cols-2 gap-2.5">
            <Campo rotulo="Nascimento">
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
          </div>
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
        <section className="card anim-in space-y-2.5">
          <h2 className="text-sm font-semibold">Dados acadêmicos</h2>

          <Campo rotulo="Cidade da universidade">
            <select
              className="field"
              value={form.cidade_universidade_id}
              onChange={(e) => {
                mudar('cidade_universidade_id', e.target.value)
                mudar('universidade_id', '') // a escolha anterior pode nao existir na nova cidade
              }}
            >
              <option value="">Todas as cidades</option>
              {cidades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}/{c.uf}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Universidade">
            <select
              className="field"
              value={form.universidade_id}
              onChange={(e) => mudar('universidade_id', e.target.value)}
            >
              <option value="">Selecione…</option>
              {universidadesFiltradas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            {form.cidade_universidade_id && universidadesFiltradas.length === 0 && (
              <span className="mt-1 block text-[11px] text-warn">
                Nenhuma universidade cadastrada nesta cidade.
              </span>
            )}
          </Campo>

          <div className="grid grid-cols-2 gap-2.5">
            <Campo rotulo="Curso">
              <input
                className="field"
                placeholder="Direito"
                value={form.curso}
                onChange={(e) => mudar('curso', e.target.value)}
              />
            </Campo>
            <Campo rotulo="Você conta por">
              <select
                className="field"
                value={form.periodo_tipo}
                onChange={(e) => {
                  mudar('periodo_tipo', e.target.value)
                  mudar('periodo_numero', '') // 8o semestre nao existe em anos
                }}
              >
                <option value="semestre">Semestre</option>
                <option value="ano">Ano</option>
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Campo rotulo={form.periodo_tipo === 'ano' ? 'Ano do curso' : 'Semestre do curso'}>
              <select
                className="field"
                value={form.periodo_numero}
                onChange={(e) => mudar('periodo_numero', e.target.value)}
              >
                <option value="">Selecione…</option>
                {Array.from({ length: LIMITE_PERIODO[form.periodo_tipo] }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}º {form.periodo_tipo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

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
            <p className="text-xs font-medium text-muted">
              Horário das aulas <span className="text-faint">(opcional)</span>
            </p>
            <p className="mb-2.5 mt-1 text-[11px] text-faint">
              É por aqui que o sistema encontra um ônibus compatível com a sua grade. Sem isso, a
              secretaria faz a alocação manualmente.
            </p>
            <GradeSemanal grade={grade} onChange={setGrade} />
          </div>
        </section>
      )}

      {passo === 2 && (
        <section className="card anim-in space-y-2.5">
          <h2 className="text-sm font-semibold">Documentos</h2>
          <p className="text-xs text-muted">
            Você pode enviar agora ou depois, na aba Docs. A alocação em uma rota só acontece
            quando os quatro forem aprovados pela secretaria.
          </p>

          <div className="space-y-2">
            {TIPOS_DOC.map((tipo) => {
              const arquivo = arquivos[tipo]
              return (
                <label
                  key={tipo}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-2.5 transition-colors ${
                    arquivo ? 'border-ok/50 bg-ok/5' : 'border-line'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      arquivo ? 'bg-ok/10 text-ok' : 'bg-raised text-faint'
                    }`}
                  >
                    {arquivo ? <Check className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{ROTULO_DOC[tipo]}</span>
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

          <div className="aviso-info">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <p className="text-xs text-muted">
              {enviados === 0
                ? 'Nenhum documento anexado. Você poderá enviá-los na aba Docs.'
                : `${enviados} de 4 anexado(s). Faltam ${4 - enviados}.`}
            </p>
          </div>
        </section>
      )}

      {passo === 3 && (
        <section className="card anim-in space-y-2.5">
          <h2 className="text-sm font-semibold">Acesso ao aplicativo</h2>
          <p className="text-xs text-muted">
            É com esses dados que você vai entrar no aplicativo daqui para frente.
          </p>

          <Campo rotulo="E-mail">
            <input
              className="field"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => mudar('email', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Senha">
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={form.senha}
              onChange={(e) => mudar('senha', e.target.value)}
            />
          </Campo>

          {form.senha.length > 0 && (
            <ul className="grid grid-cols-2 gap-1 rounded-lg bg-raised/50 p-2.5">
              {REGRAS_SENHA.map((r) => {
                const ok = r.ok(form.senha)
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-ok' : 'text-muted'}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-ok' : 'bg-faint'}`} />
                    {r.rotulo}
                  </li>
                )
              })}
            </ul>
          )}

          <Campo rotulo="Confirmar senha">
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={form.senha2}
              onChange={(e) => mudar('senha2', e.target.value)}
            />
            {form.senha2.length > 0 && form.senha !== form.senha2 && (
              <span className="mt-1 block text-[11px] text-err">As senhas não coincidem.</span>
            )}
          </Campo>
        </section>
      )}

      <div className="mt-4 flex gap-2.5">
        {passo > 0 && (
          <button
            onClick={() => setPasso((p) => p - 1)}
            className="btn-outline flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        )}

        {passo === 2 && enviados < 4 && (
          <button
            onClick={() => (modo === 'novo' ? setPasso(3) : concluir())}
            disabled={enviando}
            className="btn-outline flex items-center justify-center gap-2"
          >
            <SkipForward className="h-4 w-4" />
            {enviados === 0 ? 'Enviar depois' : 'Pular os demais'}
          </button>
        )}

        {passo < ultimoPasso ? (
          <button
            onClick={() => setPasso((p) => p + 1)}
            disabled={!podeAvancar}
            className="btn-primary flex items-center justify-center gap-2"
          >
            Continuar
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={concluir}
            disabled={enviando || !passo1Ok || !passo2Ok || !passo3Ok || (modo === 'novo' && !passo4Ok)}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {enviando ? <Spinner /> : (
              <>
                <Send className="h-4 w-4" />
                {modo === 'novo' ? 'Criar conta' : 'Enviar cadastro'}
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
      <span className="mb-1 block text-xs font-medium text-muted">{rotulo}</span>
      {children}
    </label>
  )
}
