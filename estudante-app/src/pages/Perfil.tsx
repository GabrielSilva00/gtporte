import { useEffect, useState, type ReactNode } from 'react'
import {
  BellRing,
  CalendarClock,
  ChevronDown,
  FileCheck,
  GraduationCap,
  IdCard,
  LogOut,
  Palette,
  Pencil,
  Save,
  Smartphone,
  X,
} from 'lucide-react'
import { useMinhaRota, ROTULO_PERFIL } from '@/hooks/useEstudante'
import { useAlteracoes, ROTULO_CAMPO, type CampoEditavel } from '@/hooks/useAlteracoes'
import { useCadastros } from '@/hooks/useCadastros'
import type { Perfil as P } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ContatosSecretaria } from '@/components/ContatosSecretaria'
import { IndicadorConexao } from '@/components/StatusConexao'
import { SeletorTema } from '@/components/SeletorTema'
import { CampoCadastro } from '@/components/CampoCadastro'
import { GradeSemanal } from '@/components/GradeSemanal'
import { useGrade } from '@/hooks/useGrade'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'
import { ativarPush, permissaoNotificacao } from '@/lib/push'

/** Campos que o estudante edita por aqui; os demais sao da secretaria. */
const EDITAVEIS: CampoEditavel[] = [
  'nome',
  'telefone',
  'email',
  'curso',
  'endereco',
  'data_nascimento',
  'universidade_id',
  'cidade_id',
  'perfil_uso',
  'periodo_tipo',
  'periodo_numero',
]

interface Cadastro {
  nome: string
  prontuario: string
  cpf: string | null
  email: string | null
  telefone: string | null
  curso: string | null
  endereco: string | null
  data_nascimento: string | null
  universidade_id: string
  cidade_id: string
  perfil_uso: 'ida_volta' | 'somente_ida' | 'somente_volta'
  periodo_tipo: 'ano' | 'semestre' | null
  periodo_numero: number | null
  status_documental: string
  criado_em: string
}

export function Perfil({
  perfil,
  estudanteId,
  onLogout,
}: {
  perfil: P
  estudanteId: string | null
  onLogout: () => void
}) {
  const { rota: data } = useMinhaRota()
  const { cidades, universidades } = useCadastros()
  const { pendentePorCampo, recusadas, solicitar, loading: carregandoAlt } = useAlteracoes(estudanteId)

  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Partial<Record<CampoEditavel, string>>>({})
  const [salvando, setSalvando] = useState(false)
  const [salvandoGrade, setSalvandoGrade] = useState(false)
  const grade = useGrade(estudanteId)
  // um card aberto por vez; comeca pelo que tiver pendencia
  const [aberta, setAberta] = useState<'dados' | 'grade' | null>(null)

  useEffect(() => {
    if (!estudanteId) return
    let vivo = true
    ;(async () => {
      const { data: est } = await supabase
        .from('estudante')
        .select(
          'nome,prontuario,cpf,email,telefone,curso,endereco,data_nascimento,universidade_id,cidade_id,periodo_tipo,periodo_numero,perfil_uso,status_documental,criado_em',
        )
        .eq('id', estudanteId)
        .maybeSingle()
      if (!vivo || !est) return
      const c = est as Cadastro
      setCadastro(c)
      setForm({
        nome: c.nome ?? '',
        telefone: c.telefone ?? '',
        email: c.email ?? '',
        curso: c.curso ?? '',
        endereco: c.endereco ?? '',
        data_nascimento: c.data_nascimento ?? '',
        universidade_id: c.universidade_id ?? '',
        cidade_id: c.cidade_id ?? '',
        perfil_uso: c.perfil_uso,
        periodo_tipo: c.periodo_tipo ?? 'semestre',
        periodo_numero: c.periodo_numero ? String(c.periodo_numero) : '',
      })
    })()
    return () => {
      vivo = false
    }
  }, [estudanteId])

  const nomeCidade = (id?: string | null) => {
    const c = cidades.find((x) => x.id === id)
    return c ? `${c.nome}/${c.uf}` : '—'
  }
  const nomeUniversidade = (id?: string | null) =>
    universidades.find((x) => x.id === id)?.nome ?? '—'

  /** Mostra o rotulo, nao o uuid, quando o pendente e cidade/universidade. */
  const pendenteLegivel = (campo: CampoEditavel) => {
    const p = pendentePorCampo.get(campo)
    if (!p) return null
    let valor = p.valor_novo
    if (campo === 'cidade_id') valor = nomeCidade(p.valor_novo)
    if (campo === 'universidade_id') valor = nomeUniversidade(p.valor_novo)
    if (campo === 'perfil_uso' && valor) valor = ROTULO_PERFIL[valor as keyof typeof ROTULO_PERFIL]
    return { ...p, valor_novo: valor }
  }

  const recusaDe = (campo: CampoEditavel) =>
    recusadas.find((r) => r.campo === campo)?.observacao ?? null

  const salvar = async () => {
    setSalvando(true)
    try {
      const campos: Partial<Record<CampoEditavel, string | null>> = {}
      for (const c of EDITAVEIS) {
        const v = (form[c] ?? '').trim()
        campos[c] = v === '' ? null : v
      }
      await solicitar(campos)
      toast('Alterações enviadas para a secretaria validar.')
      setEditando(false)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setSalvando(false)
    }
  }

  const corDoc =
    cadastro?.status_documental === 'aprovado'
      ? 'chip-ok'
      : cadastro?.status_documental === 'pendente'
        ? 'chip-warn'
        : 'chip-err'

  const mudar = (campo: CampoEditavel, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))

  const temPendencia = pendentePorCampo.size > 0

  return (
    <div className="space-y-3 px-4 pb-10 pt-16">
      <div className="card anim-in flex flex-col items-center py-7">
        <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/10 text-3xl font-bold text-brand-500">
          {perfil.nome.charAt(0)}
        </div>
        <h2 className="text-xl font-bold">{cadastro?.nome ?? perfil.nome}</h2>
        <div className="mt-2 flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 text-brand-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-brand-500">
            Estudante
          </span>
        </div>
        {cadastro && (
          <p className="mt-2 font-mono text-sm text-muted">Prontuário {cadastro.prontuario}</p>
        )}
        <IndicadorConexao className="mt-4" />
      </div>

      {!estudanteId ? (
        <div className="card">
          <p className="text-sm font-semibold">Cadastro incompleto</p>
          <p className="mt-1 text-xs text-muted">
            Conclua o cadastro de estudante para ver e editar seus dados.
          </p>
        </div>
      ) : !cadastro || carregandoAlt ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Meus dados: pessoais e academicos num card so, com uma edicao so */}
          <Secao
            icone={IdCard}
            titulo="Meus dados"
            resumo={
              temPendencia
                ? `${pendentePorCampo.size} alteração(ões) aguardando validação`
                : 'Dados pessoais e acadêmicos'
            }
            pendente={temPendencia}
            aberta={aberta === 'dados'}
            onAlternar={() => setAberta(aberta === 'dados' ? null : 'dados')}
          >
            <div className="flex justify-end">
              {editando ? (
                <button
                  onClick={() => setEditando(false)}
                  className="flex items-center gap-1 text-xs text-muted"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              ) : (
                <button
                  onClick={() => setEditando(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
            </div>

            {temPendencia && (
              <div className="aviso-warn">
                <p className="text-xs text-muted">
                  <b className="text-warn">{pendentePorCampo.size} alteração(ões) pendente(s).</b>{' '}
                  Os dados atualizados foram enviados para a secretaria validar. Até lá, o
                  cadastro mantém os valores anteriores.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-line/60 p-3">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">
                Dados pessoais
              </p>
              <div className="space-y-3">
          <CampoCadastro rotulo="Nome completo" pendente={pendenteLegivel('nome')} recusa={recusaDe('nome')}>
            {editando ? (
              <input className="field" value={form.nome ?? ''} onChange={(e) => mudar('nome', e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{cadastro.nome}</p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="CPF">
            <p className="font-mono text-sm font-medium">{cadastro.cpf ?? '—'}</p>
          </CampoCadastro>

          <CampoCadastro rotulo="Data de nascimento" pendente={pendenteLegivel('data_nascimento')} recusa={recusaDe('data_nascimento')}>
            {editando ? (
              <input
                type="date"
                className="field"
                value={form.data_nascimento ?? ''}
                onChange={(e) => mudar('data_nascimento', e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium">
                {cadastro.data_nascimento
                  ? new Date(cadastro.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')
                  : '—'}
              </p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="Telefone" pendente={pendenteLegivel('telefone')} recusa={recusaDe('telefone')}>
            {editando ? (
              <input className="field" value={form.telefone ?? ''} onChange={(e) => mudar('telefone', e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{cadastro.telefone ?? '—'}</p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="E-mail" pendente={pendenteLegivel('email')} recusa={recusaDe('email')}>
            {editando ? (
              <input className="field" type="email" value={form.email ?? ''} onChange={(e) => mudar('email', e.target.value)} />
            ) : (
              <p className="truncate text-sm font-medium">{cadastro.email ?? '—'}</p>
            )}
          </CampoCadastro>

              </div>
            </div>

            <div className="rounded-xl border border-line/60 p-3">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">
                Dados acadêmicos
              </p>
              <div className="space-y-3">
          <CampoCadastro rotulo="Curso" pendente={pendenteLegivel('curso')} recusa={recusaDe('curso')}>
            {editando ? (
              <input className="field" value={form.curso ?? ''} onChange={(e) => mudar('curso', e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{cadastro.curso ?? '—'}</p>
            )}
          </CampoCadastro>

          <CampoCadastro
            rotulo="Período do curso"
            pendente={pendenteLegivel('periodo_numero')}
            recusa={recusaDe('periodo_numero')}
          >
            {editando ? (
              <div className="flex gap-2">
                <select
                  className="field"
                  value={form.periodo_tipo ?? 'semestre'}
                  onChange={(e) => {
                    mudar('periodo_tipo', e.target.value)
                    mudar('periodo_numero', '')
                  }}
                >
                  <option value="semestre">Semestre</option>
                  <option value="ano">Ano</option>
                </select>
                <select
                  className="field"
                  value={form.periodo_numero ?? ''}
                  onChange={(e) => mudar('periodo_numero', e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from(
                    { length: (form.periodo_tipo ?? 'semestre') === 'ano' ? 6 : 12 },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n} value={String(n)}>
                      {n}º
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm font-medium">
                {cadastro.periodo_numero
                  ? `${cadastro.periodo_numero}º ${cadastro.periodo_tipo === 'ano' ? 'ano' : 'semestre'}`
                  : '—'}
              </p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="Universidade" pendente={pendenteLegivel('universidade_id')} recusa={recusaDe('universidade_id')}>
            {editando ? (
              <select className="field" value={form.universidade_id ?? ''} onChange={(e) => mudar('universidade_id', e.target.value)}>
                {universidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-medium">{nomeUniversidade(cadastro.universidade_id)}</p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="Cidade" pendente={pendenteLegivel('cidade_id')} recusa={recusaDe('cidade_id')}>
            {editando ? (
              <select className="field" value={form.cidade_id ?? ''} onChange={(e) => mudar('cidade_id', e.target.value)}>
                {cidades.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}/{c.uf}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-medium">{nomeCidade(cadastro.cidade_id)}</p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="Endereço" pendente={pendenteLegivel('endereco')} recusa={recusaDe('endereco')}>
            {editando ? (
              <input className="field" value={form.endereco ?? ''} onChange={(e) => mudar('endereco', e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{cadastro.endereco ?? '—'}</p>
            )}
          </CampoCadastro>

          <CampoCadastro rotulo="Perfil de uso" pendente={pendenteLegivel('perfil_uso')} recusa={recusaDe('perfil_uso')}>
            {editando ? (
              <select className="field" value={form.perfil_uso ?? ''} onChange={(e) => mudar('perfil_uso', e.target.value)}>
                <option value="ida_volta">Ida e volta</option>
                <option value="somente_ida">Somente ida</option>
                <option value="somente_volta">Somente volta</option>
              </select>
            ) : (
              <p className="text-sm font-medium">{ROTULO_PERFIL[cadastro.perfil_uso]}</p>
            )}
          </CampoCadastro>

              </div>
            </div>

            {editando && (
              <button onClick={salvar} disabled={salvando} className="btn-primary flex items-center justify-center gap-2">
                {salvando ? <Spinner /> : (
                  <>
                    <Save className="h-4 w-4" />
                    Gravar alterações
                  </>
                )}
              </button>
            )}
          </Secao>

          {/* Grade de aulas */}
          <Secao
            icone={CalendarClock}
            titulo="Grade de aulas"
            resumo={
              grade.pendente
                ? 'Alteração aguardando validação'
                : grade.vazia
                  ? 'Não informada'
                  : `${grade.diasPreenchidos} dia(s) com aula`
            }
            pendente={!!grade.pendente || grade.vazia}
            aberta={aberta === 'grade'}
            onAlternar={() => setAberta(aberta === 'grade' ? null : 'grade')}
          >
            {grade.pendente && (
              <div className="aviso-warn">
                <p className="text-xs text-muted">
                  <b className="text-warn">Grade aguardando validação.</b> Os dias em laranja
                  foram alterados e enviados para a secretaria. Até a aprovação, a alocação
                  continua usando a grade anterior.
                </p>
              </div>
            )}

            {grade.recusa && !grade.pendente && (
              <div className="aviso-err">
                <p className="text-xs text-muted">
                  <b className="text-err">Última alteração recusada.</b> {grade.recusa}
                </p>
              </div>
            )}

            {grade.vazia ? (
              <div className="aviso-warn">
                <p className="text-xs text-muted">
                  <b className="text-warn">Sua grade não está informada.</b> É por ela que o
                  sistema encontra um ônibus compatível com o seu horário — sem ela, a alocação
                  depende da secretaria fazer manualmente.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                Marque os dias em que você tem aula e informe os horários. A alteração passa pela
                validação da secretaria antes de valer.
              </p>
            )}

            <GradeSemanal
              grade={grade.grade}
              onChange={grade.setGrade}
              pendentes={grade.diasPendentes}
              vigente={grade.vigente}
            />

            {grade.alterada && (
              <button
                onClick={async () => {
                  setSalvandoGrade(true)
                  try {
                    await grade.salvar()
                    toast('Grade enviada para a secretaria validar.')
                  } catch (e) {
                    toast((e as Error).message, 'err')
                  } finally {
                    setSalvandoGrade(false)
                  }
                }}
                disabled={salvandoGrade}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {salvandoGrade ? <Spinner /> : (
                  <>
                    <Save className="h-4 w-4" />
                    Enviar para validação
                  </>
                )}
              </button>
            )}
          </Secao>

          {/* Situacao da documentacao */}
          <div className="card anim-in flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                <FileCheck className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Documentação</h3>
                <p className="text-[11px] text-muted">Validada pela secretaria</p>
              </div>
            </div>
            <span className={corDoc}>{cadastro.status_documental}</span>
          </div>
        </>
      )}

      {data?.rota && (
        <div className="card anim-in">
          <h3 className="mb-2 text-sm font-semibold text-muted">Minha rota</h3>
          <p className="text-xs font-semibold text-brand-500">{data.rota.codigo}</p>
          <p className="text-sm font-bold">{data.rota.nome}</p>
          <p className="mt-1 text-xs text-muted">
            {data.rota.origem} &rarr; {data.rota.destino}
          </p>
        </div>
      )}

      <AvisosNoCelular />

      <div className="card anim-in space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold">Aparência</h3>
        </div>
        <SeletorTema />
        <p className="text-[11px] text-muted">
          Em &ldquo;Sistema&rdquo;, o app acompanha o tema do seu aparelho.
        </p>
      </div>

      <ContatosSecretaria />

      <div className="card anim-in space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Smartphone className="h-4 w-4" />
          <span>GTPORTE Estudante v1.0</span>
        </div>
        <p className="text-[11px] text-faint">
          Instale na tela inicial do celular para acesso rápido.
        </p>
      </div>

      <button onClick={onLogout} className="btn-danger flex items-center justify-center gap-2">
        <LogOut className="h-4 w-4" />
        Sair da conta
      </button>
    </div>
  )
}

/**
 * Card recolhivel do perfil. Fica laranja quando ha algo aguardando a
 * secretaria, para o aluno achar a pendencia sem abrir cada card.
 */
function Secao({
  icone: Icone,
  titulo,
  resumo,
  pendente,
  aberta,
  onAlternar,
  children,
}: {
  icone: typeof IdCard
  titulo: string
  resumo: string
  pendente?: boolean
  aberta: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <div className={`card anim-in ${pendente ? 'border-warn/50' : ''}`}>
      <button
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            pendente ? 'bg-warn/10 text-warn' : 'bg-brand-500/10 text-brand-500'
          }`}
        >
          <Icone className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titulo}</span>
          <span className={`block truncate text-[11px] ${pendente ? 'text-warn' : 'text-muted'}`}>
            {resumo}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-faint transition-transform ${aberta ? 'rotate-180' : ''}`}
        />
      </button>
      {aberta && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

/** Liga as notificacoes do sistema (e o push, quando configurado). */
function AvisosNoCelular() {
  const [estado, setEstado] = useState(permissaoNotificacao())
  const [ligando, setLigando] = useState(false)

  if (estado === 'indisponivel') return null

  return (
    <div className="card anim-in flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
          <BellRing className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Avisos no celular</h3>
          <p className="text-[11px] text-muted">
            {estado === 'granted'
              ? 'Ligados: ônibus próximo, respostas e validação'
              : estado === 'denied'
                ? 'Bloqueados nas configurações do aparelho'
                : 'Ônibus próximo, respostas e validação do cadastro'}
          </p>
        </div>
      </div>
      {estado !== 'granted' && estado !== 'denied' && (
        <button
          disabled={ligando}
          onClick={async () => {
            setLigando(true)
            try {
              const r = await ativarPush()
              setEstado(permissaoNotificacao())
              if (r === 'ativado') toast('Avisos ligados neste aparelho.')
              else if (r === 'so-app-aberto')
                toast('Avisos ligados enquanto o app estiver aberto.')
            } catch (e) {
              toast((e as Error).message, 'err')
            } finally {
              setLigando(false)
            }
          }}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {ligando ? <Spinner className="h-4 w-4" /> : 'Ligar'}
        </button>
      )}
    </div>
  )
}
