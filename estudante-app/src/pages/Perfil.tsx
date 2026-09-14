import { useEffect, useState } from 'react'
import { GraduationCap, LogOut, Palette, Pencil, Save, Smartphone, X } from 'lucide-react'
import { useMinhaRota, ROTULO_PERFIL } from '@/hooks/useEstudante'
import { useAlteracoes, ROTULO_CAMPO, type CampoEditavel } from '@/hooks/useAlteracoes'
import { useCadastros } from '@/hooks/useCadastros'
import type { Perfil as P } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ContatosSecretaria } from '@/components/ContatosSecretaria'
import { IndicadorConexao } from '@/components/StatusConexao'
import { SeletorTema } from '@/components/SeletorTema'
import { CampoCadastro } from '@/components/CampoCadastro'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

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
  'ano_semestre',
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
  ano_semestre: string | null
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

  useEffect(() => {
    if (!estudanteId) return
    let vivo = true
    ;(async () => {
      const { data: est } = await supabase
        .from('estudante')
        .select(
          'nome,prontuario,cpf,email,telefone,curso,endereco,data_nascimento,universidade_id,cidade_id,ano_semestre,perfil_uso,status_documental,criado_em',
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
        ano_semestre: c.ano_semestre ?? '',
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

  return (
    <div className="space-y-4 px-4 pb-24 pt-16">
      <div className="card anim-in flex flex-col items-center py-8">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/10 text-3xl font-bold text-brand-500">
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
        <div className="card anim-in space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Meus dados</h3>
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

          {pendentePorCampo.size > 0 && (
            <div className="aviso-warn">
              <p className="text-xs text-muted">
                <b className="text-warn">{pendentePorCampo.size} alteração(ões) pendente(s).</b> Os
                dados atualizados foram enviados para a secretaria validar. Até lá, o cadastro
                mantém os valores anteriores.
              </p>
            </div>
          )}

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

            <CampoCadastro rotulo="Curso" pendente={pendenteLegivel('curso')} recusa={recusaDe('curso')}>
              {editando ? (
                <input className="field" value={form.curso ?? ''} onChange={(e) => mudar('curso', e.target.value)} />
              ) : (
                <p className="text-sm font-medium">{cadastro.curso ?? '—'}</p>
              )}
            </CampoCadastro>

            <CampoCadastro rotulo="Ano/Semestre" pendente={pendenteLegivel('ano_semestre')} recusa={recusaDe('ano_semestre')}>
              {editando ? (
                <input
                  className="field"
                  placeholder="2026/1"
                  value={form.ano_semestre ?? ''}
                  onChange={(e) => mudar('ano_semestre', e.target.value)}
                />
              ) : (
                <p className="text-sm font-medium">{cadastro.ano_semestre ?? '—'}</p>
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

            <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
              <span className="text-xs text-muted">Documentação</span>
              <span className={corDoc}>{cadastro.status_documental}</span>
            </div>
          </div>

          {editando && (
            <button onClick={salvar} disabled={salvando} className="btn-primary mt-2 flex items-center justify-center gap-2">
              {salvando ? <Spinner /> : (
                <>
                  <Save className="h-4 w-4" />
                  Gravar alterações
                </>
              )}
            </button>
          )}
        </div>
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
