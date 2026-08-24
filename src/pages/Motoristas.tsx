import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCidades, useMotoristas, useRotas } from '../hooks/useCadastros'
import {
  BUCKET_DOCUMENTOS,
  caminhoArquivoMotorista,
  mensagemErro,
  supabase,
} from '../lib/supabase'
import {
  badgeDocumental,
  badgeMotorista,
  badgeSituacaoMotorista,
  dataBR,
  diasParaVencer,
} from '../lib/format'
import {
  ABAS_MOTORISTA,
  CAMPOS_CNH,
  CAMPOS_ENDERECO,
  CAMPOS_EXAMES,
  CAMPOS_PESSOAIS,
  CAMPOS_POR_ABA,
  CAMPOS_PROFISSIONAL,
  type AbaMotorista,
} from '../lib/motorista'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Campo, GradeCampos } from '../components/ui/Campo'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { UploadFoto } from '../components/ui/UploadFoto'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeArquivo, IconeBusca, IconeInfo, IconeMais } from '../components/icons'
import {
  ROTULO_CURSO,
  ROTULO_DOCUMENTO_MOTORISTA,
  ROTULO_SITUACAO_MOTORISTA,
  type DocumentoMotorista,
  type Motorista,
  type MotoristaContatoEmergencia,
  type MotoristaCurso,
  type Perfil,
  type SituacaoMotorista,
  type StatusMotorista,
  type TipoCursoMotorista,
} from '../lib/types'

/** Linhas editáveis das tabelas filhas — sem id enquanto não salvas. */
type LinhaCurso = Omit<MotoristaCurso, 'id' | 'motorista_id'>
type LinhaContato = Omit<MotoristaContatoEmergencia, 'id' | 'motorista_id'>

/** Só nome e CNH são obrigatórios; o resto é preenchido ao longo do tempo. */
type Formulario = Record<string, unknown> & {
  nome: string
  cnh: string
  status: StatusMotorista
  situacao: SituacaoMotorista
  perfil_id: string
}

const VAZIO: Formulario = {
  nome: '',
  cnh: '',
  categoria_cnh: 'D',
  status: 'aguardando',
  situacao: 'ativo',
  perfil_id: '',
  cnh_ear: true,
}

const SITUACOES: SituacaoMotorista[] = ['ativo', 'ferias', 'afastado', 'inativo']

/** RF04 — cadastro e gerenciamento de motoristas. */
export default function Motoristas() {
  const { data: motoristas, isLoading, error } = useMotoristas()
  const { data: rotas } = useRotas()
  const { data: cidades } = useCidades()
  const qc = useQueryClient()
  const toast = useToast()

  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | SituacaoMotorista>('todos')

  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<AbaMotorista>('pessoais')
  const [editando, setEditando] = useState<Motorista | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [cursos, setCursos] = useState<LinhaCurso[]>([])
  const [contatos, setContatos] = useState<LinhaContato[]>([])
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)

  const rotaPorMotorista = new Map((rotas ?? []).map((r) => [r.motorista_id, r.codigo]))

  // Usuários com perfil de motorista disponíveis para vincular ao cadastro.
  // Sem esse vínculo o painel do motorista não sabe qual rota mostrar.
  const { data: perfisMotorista } = useQuery({
    queryKey: ['perfis-motorista'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('perfil')
        .select('*')
        .eq('tipo', 'motorista')
        .order('nome')
      if (err) throw err
      return data as Perfil[]
    },
  })

  // Documentos do motorista em edição, carregados só quando o modal abre
  const { data: documentos } = useQuery({
    queryKey: ['documentos-motorista', editando?.id],
    enabled: !!editando,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('documento_motorista')
        .select('*')
        .eq('motorista_id', editando!.id)
        .order('criado_em', { ascending: false })
      if (err) throw err
      return data as DocumentoMotorista[]
    },
  })

  const vinculados = new Set(
    (motoristas ?? []).map((m) => m.perfil_id).filter((id): id is string => !!id),
  )
  const disponiveis = (perfisMotorista ?? []).filter(
    (p) => p.id === form.perfil_id || !vinculados.has(p.id),
  )
  const acessoSelecionado = perfisMotorista?.find((p) => p.id === form.perfil_id) ?? null

  const contadores = useMemo(() => {
    const base: Record<'todos' | SituacaoMotorista, number> = {
      todos: motoristas?.length ?? 0,
      ativo: 0,
      ferias: 0,
      afastado: 0,
      inativo: 0,
    }
    for (const m of motoristas ?? []) base[m.situacao ?? 'ativo'] += 1
    return base
  }, [motoristas])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (motoristas ?? []).filter((m) => {
      if (filtroSituacao !== 'todos' && (m.situacao ?? 'ativo') !== filtroSituacao) return false
      if (!termo) return true
      return `${m.nome} ${m.cnh} ${m.cpf ?? ''} ${m.matricula_interna ?? ''}`
        .toLowerCase()
        .includes(termo)
    })
  }, [motoristas, filtroSituacao, busca])

  const salvar = useMutation({
    mutationFn: async () => {
      // Uma única RPC grava motorista, cursos e contatos na mesma
      // transação — evita cadastro salvo pela metade (migration 0011).
      const { data: id, error: err } = await supabase.rpc('salvar_motorista', {
        p_motorista_id: editando?.id ?? null,
        p_dados: { ...form, nome: form.nome.trim(), cnh: form.cnh.trim() },
        p_cursos: cursos.filter((c) => !!c.tipo),
        p_contatos: contatos.filter((c) => c.nome.trim() && c.telefone.trim()),
      })
      if (err) throw err

      const motoristaId = id as string
      if (foto && motoristaId) {
        const caminho = caminhoArquivoMotorista(motoristaId, 'foto', foto)
        const { error: erroFoto } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .upload(caminho, foto, { upsert: true })
        if (erroFoto) throw erroFoto

        const { error: erroPath } = await supabase
          .from('motorista')
          .update({ foto_path: caminho })
          .eq('id', motoristaId)
        if (erroPath) throw erroPath
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['motoristas'] })
      qc.invalidateQueries({ queryKey: ['rotas'] })
      toast.sucesso(editando ? 'Motorista atualizado.' : 'Motorista cadastrado.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirNovo() {
    setEditando(null)
    setForm(VAZIO)
    setCursos([])
    setContatos([])
    setFoto(null)
    setFotoUrl(null)
    setAba('pessoais')
    setAberto(true)
  }

  async function abrirEdicao(m: Motorista) {
    setEditando(m)
    setAba('pessoais')
    setFoto(null)
    setFotoUrl(null)
    setForm({ ...(m as unknown as Formulario), perfil_id: m.perfil_id ?? '' })
    setAberto(true)

    const [{ data: cs }, { data: ct }] = await Promise.all([
      supabase.from('motorista_curso').select('*').eq('motorista_id', m.id),
      supabase.from('motorista_contato_emergencia').select('*').eq('motorista_id', m.id),
    ])
    setCursos((cs ?? []) as LinhaCurso[])
    setContatos((ct ?? []) as LinhaContato[])

    if (m.foto_path) {
      const { data: assinada } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .createSignedUrl(m.foto_path, 300)
      setFotoUrl(assinada?.signedUrl ?? null)
    }
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
    setCursos([])
    setContatos([])
  }

  function mudar(chave: string, valor: unknown) {
    setForm((atual) => ({ ...atual, [chave]: valor }))
  }

  const valido = form.nome.trim().length > 2 && form.cnh.trim().length >= 9

  /** Aba com algum campo ainda em branco ganha o ponto de atenção. */
  function temPendencia(chave: AbaMotorista) {
    const campos = CAMPOS_POR_ABA[chave]
    if (!campos) return false
    return campos.some((c) => c.tipo !== 'booleano' && !form[c.chave])
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Motoristas</h1>
          <div className="mt-1 text-[13px] text-muted">
            Equipe operacional · {motoristas?.length ?? 0} cadastrados · {filtrados.length} no
            filtro
          </div>
        </div>
        <button onClick={abrirNovo} className="btn-primary">
          <IconeMais size={14} />
          Novo motorista
        </button>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela />}

      {motoristas && motoristas.length === 0 && (
        <Vazio
          titulo="Nenhum motorista cadastrado"
          descricao="Toda rota exige um motorista responsável."
        />
      )}

      {motoristas && motoristas.length > 0 && (
        <div className="card mb-3.5 flex flex-wrap items-center gap-3 p-3.5">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft">
              <IconeBusca size={15} />
            </span>
            <input
              className="field pl-9"
              placeholder="Nome, CNH, CPF ou matrícula"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Tabs
            variante="pilulas"
            abas={[
              { chave: 'todos', rotulo: 'Todos', contador: contadores.todos },
              ...SITUACOES.map((s) => ({
                chave: s,
                rotulo: ROTULO_SITUACAO_MOTORISTA[s],
                contador: contadores[s],
              })),
            ]}
            ativa={filtroSituacao}
            onMudar={setFiltroSituacao}
          />
        </div>
      )}

      {motoristas && motoristas.length > 0 && filtrados.length === 0 && (
        <Vazio titulo="Nenhum motorista no filtro" descricao="Ajuste a busca ou a situação." />
      )}

      {filtrados.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Motorista</th>
                <th className="th">CNH</th>
                <th className="th">Cat.</th>
                <th className="th">Validade</th>
                <th className="th">Rota</th>
                <th className="th">Telefone</th>
                <th className="th">Situação</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => {
                const restam = diasParaVencer(m.validade_cnh)
                return (
                  <tr
                    key={m.id}
                    onClick={() => abrirEdicao(m)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-bg"
                  >
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar nome={m.nome} />
                        <div className="min-w-0">
                          <div className="font-medium">{m.nome}</div>
                          {m.matricula_interna && (
                            <div className="font-mono text-[11px] text-soft">
                              mat. {m.matricula_interna}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="td font-mono text-muted">{m.cnh}</td>
                    <td className="td">
                      <span className="rounded-[5px] bg-tint px-1.5 py-0.5 font-mono text-[11.5px]">
                        {m.categoria_cnh}
                      </span>
                    </td>
                    <td className="td font-mono text-[12px]">
                      <span
                        className={
                          restam !== null && restam < 0
                            ? 'text-danger'
                            : restam !== null && restam <= 60
                              ? 'text-warn'
                              : 'text-muted'
                        }
                      >
                        {dataBR(m.validade_cnh)}
                      </span>
                    </td>
                    <td className="td font-mono font-medium text-primary">
                      {rotaPorMotorista.get(m.id) ?? '-'}
                    </td>
                    <td className="td font-mono text-[12px] text-muted">{m.telefone ?? '-'}</td>
                    <td className="td">
                      <Badge estilo={badgeSituacaoMotorista(m.situacao ?? 'ativo')} />
                    </td>
                    <td className="td">
                      <Badge estilo={badgeMotorista(m.status)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar ${editando.nome}` : 'Novo motorista'}
        descricao="Apenas nome e número da CNH são obrigatórios para salvar."
        largura={820}
        onFechar={fechar}
        rodape={
          <>
            <button onClick={fechar} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvar.mutate()}
              disabled={!valido || salvar.isPending}
              className="btn-primary"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar motorista'}
            </button>
          </>
        }
      >
        {/*
          Identificação fora das abas: nome, CNH e situação são os campos
          mais consultados, e enterrá-los em uma aba atrapalharia o uso.
        */}
        <div className="mb-4 grid grid-cols-1 gap-3.5 rounded-card border border-edge bg-panel p-4 sm:grid-cols-[auto_1fr]">
          <UploadFoto
            nome={form.nome}
            url={fotoUrl}
            arquivo={foto}
            tamanho={76}
            onSelecionar={setFoto}
            rotulo="Foto do motorista"
            ajuda="Aparece na lista e no crachá."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="field-label">
                Nome completo<span className="ml-0.5 text-accent">*</span>
              </span>
              <input
                value={form.nome}
                onChange={(e) => mudar('nome', e.target.value)}
                placeholder="Como consta na CNH"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Situação cadastral</span>
              <select
                value={form.situacao}
                onChange={(e) => mudar('situacao', e.target.value)}
                className="field"
              >
                {SITUACOES.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO_MOTORISTA[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">
                Número de registro da CNH<span className="ml-0.5 text-accent">*</span>
              </span>
              <input
                value={form.cnh}
                onChange={(e) => mudar('cnh', e.target.value.replace(/\D/g, ''))}
                placeholder="Somente números"
                className="field font-mono"
              />
            </label>
            <label>
              <span className="field-label">Status operacional</span>
              <select
                value={form.status}
                onChange={(e) => mudar('status', e.target.value)}
                className="field"
              >
                <option value="aguardando">Aguardando</option>
                <option value="em_rota">Em rota</option>
                <option value="folga">Folga</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>
        </div>

        <Tabs
          className="mb-4"
          abas={ABAS_MOTORISTA.map((a) => ({
            ...a,
            alerta: temPendencia(a.chave),
            desabilitada: a.chave === 'documentos' && !editando,
            contador:
              a.chave === 'cursos'
                ? cursos.length
                : a.chave === 'contatos'
                  ? contatos.length
                  : a.chave === 'documentos'
                    ? documentos?.length
                    : undefined,
          }))}
          ativa={aba}
          onMudar={setAba}
        />

        {aba === 'pessoais' && (
          <>
            <GradeCampos>
              {CAMPOS_PESSOAIS.map((c) => (
                <Campo key={c.chave} campo={c} valor={form[c.chave]} onMudar={mudar} />
              ))}
            </GradeCampos>

            <div className="eyebrow mb-3 mt-5">Endereço</div>
            <GradeCampos>
              {CAMPOS_ENDERECO.map((c) => (
                <Campo key={c.chave} campo={c} valor={form[c.chave]} onMudar={mudar} />
              ))}
              <label>
                <span className="field-label">Cidade</span>
                <select
                  value={(form.cidade_id as string) ?? ''}
                  onChange={(e) => mudar('cidade_id', e.target.value || null)}
                  className="field"
                >
                  <option value="">Não informada</option>
                  {cidades?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}/{c.uf}
                    </option>
                  ))}
                </select>
              </label>
            </GradeCampos>
          </>
        )}

        {aba === 'cnh' && (
          <GradeCampos>
            {CAMPOS_CNH.map((c) => (
              <Campo key={c.chave} campo={c} valor={form[c.chave]} onMudar={mudar} />
            ))}
          </GradeCampos>
        )}

        {aba === 'exames' && (
          <>
            <GradeCampos>
              {CAMPOS_EXAMES.map((c) => (
                <Campo key={c.chave} campo={c} valor={form[c.chave]} onMudar={mudar} />
              ))}
            </GradeCampos>
            <Nota>
              O exame toxicológico é obrigatório para as categorias C, D e E e precisa estar
              válido para o motorista poder assumir rota.
            </Nota>
          </>
        )}

        {aba === 'profissional' && (
          <GradeCampos>
            {CAMPOS_PROFISSIONAL.map((c) => (
              <Campo key={c.chave} campo={c} valor={form[c.chave]} onMudar={mudar} />
            ))}
          </GradeCampos>
        )}

        {aba === 'cursos' && (
          <ListaCursos linhas={cursos} onMudar={setCursos} />
        )}

        {aba === 'contatos' && (
          <ListaContatos linhas={contatos} onMudar={setContatos} />
        )}

        {aba === 'documentos' && (
          <div>
            {(documentos ?? []).length === 0 ? (
              <Nota>
                Nenhum documento enviado. O próprio motorista envia os arquivos pelo painel dele,
                em <b>Meus documentos</b>; aqui o setor acompanha e aprova pela tela de Documentos.
              </Nota>
            ) : (
              <div className="flex flex-col gap-2">
                {(documentos ?? []).map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-field border border-edge px-3 py-2.5"
                  >
                    <span className="text-[12.5px] font-medium">
                      {ROTULO_DOCUMENTO_MOTORISTA[d.tipo]}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
                      <IconeArquivo size={12} />
                      {d.nome_arquivo}
                    </span>
                    {d.validade && (
                      <span className="text-[11px] text-muted">até {dataBR(d.validade)}</span>
                    )}
                    <span className="ml-auto">
                      <Badge estilo={badgeDocumental(d.status)} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vínculo de acesso — vale para qualquer aba, então fica no rodapé */}
        <div className="mt-5 border-t border-line pt-4">
          <label>
            <span className="field-label">Usuário de acesso ao painel do motorista</span>
            <select
              value={form.perfil_id}
              onChange={(e) => mudar('perfil_id', e.target.value)}
              className="field"
            >
              <option value="">Sem acesso ao painel</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {p.login ?? p.email}
                </option>
              ))}
            </select>
          </label>
          <Nota>
            {acessoSelecionado ? (
              <>
                Ao salvar, <b>{acessoSelecionado.nome}</b> passa a ver no painel do motorista as
                rotas em que este cadastro for o responsável.
              </>
            ) : (
              <>
                O acesso é criado em <b>Funcionários</b>, com o perfil <b>Motorista</b>. Sem esse
                vínculo o cadastro funciona normalmente, mas a pessoa não entra no painel.
              </>
            )}
          </Nota>
        </div>
      </Modal>
    </div>
  )
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
      <span className="mt-px shrink-0 text-primary">
        <IconeInfo size={15} />
      </span>
      <span>{children}</span>
    </div>
  )
}

const TIPOS_CURSO = Object.keys(ROTULO_CURSO) as TipoCursoMotorista[]

/** Cursos e treinamentos: todos opcionais, N por motorista. */
function ListaCursos({
  linhas,
  onMudar,
}: {
  linhas: LinhaCurso[]
  onMudar: (l: LinhaCurso[]) => void
}) {
  function atualizar(i: number, campo: keyof LinhaCurso, valor: string) {
    onMudar(linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor || null } : l)))
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {linhas.map((l, i) => (
          <div key={i} className="rounded-field border border-edge p-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <label className="sm:col-span-2">
                <span className="field-label">Curso</span>
                <select
                  value={l.tipo ?? ''}
                  onChange={(e) => atualizar(i, 'tipo', e.target.value)}
                  className="field"
                >
                  {TIPOS_CURSO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_CURSO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Conclusão</span>
                <input
                  type="date"
                  value={l.conclusao ?? ''}
                  onChange={(e) => atualizar(i, 'conclusao', e.target.value)}
                  className="field"
                />
              </label>
              <label>
                <span className="field-label">Validade</span>
                <input
                  type="date"
                  value={l.validade ?? ''}
                  onChange={(e) => atualizar(i, 'validade', e.target.value)}
                  className="field"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">Instituição</span>
                <input
                  value={l.instituicao ?? ''}
                  onChange={(e) => atualizar(i, 'instituicao', e.target.value)}
                  placeholder="SEST SENAT, autoescola…"
                  className="field"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">
                  Descrição {l.tipo === 'outro' && <span className="text-accent">*</span>}
                </span>
                <input
                  value={l.descricao ?? ''}
                  onChange={(e) => atualizar(i, 'descricao', e.target.value)}
                  placeholder={l.tipo === 'outro' ? 'Nome do curso' : 'Opcional'}
                  className="field"
                />
              </label>
            </div>
            <button
              onClick={() => onMudar(linhas.filter((_, idx) => idx !== i))}
              className="mt-2 text-[11.5px] text-danger hover:underline"
            >
              remover curso
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          onMudar([
            ...linhas,
            { tipo: 'mopp', descricao: null, instituicao: null, conclusao: null, validade: null },
          ])
        }
        className="btn-ghost mt-3"
      >
        <IconeMais size={13} />
        Adicionar curso
      </button>

      {linhas.length === 0 && (
        <Nota>
          Cursos são opcionais no cadastro, mas MOPP e transporte coletivo costumam ser exigidos
          pela fiscalização conforme o tipo de rota.
        </Nota>
      )}
    </div>
  )
}

/** Contatos de emergência — pelo menos um é recomendado. */
function ListaContatos({
  linhas,
  onMudar,
}: {
  linhas: LinhaContato[]
  onMudar: (l: LinhaContato[]) => void
}) {
  function atualizar(i: number, campo: keyof LinhaContato, valor: string) {
    onMudar(linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label>
              <span className="field-label">Nome</span>
              <input
                value={l.nome}
                onChange={(e) => atualizar(i, 'nome', e.target.value)}
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Parentesco</span>
              <input
                value={l.parentesco ?? ''}
                onChange={(e) => atualizar(i, 'parentesco', e.target.value)}
                placeholder="Cônjuge, filho…"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Telefone</span>
              <input
                value={l.telefone}
                onChange={(e) => atualizar(i, 'telefone', e.target.value)}
                placeholder="(18) 99999-0000"
                className="field font-mono"
              />
            </label>
            <button
              onClick={() => onMudar(linhas.filter((_, idx) => idx !== i))}
              className="btn-ghost mb-px px-3 py-2.5 text-[12px] text-danger"
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => onMudar([...linhas, { nome: '', parentesco: null, telefone: '' }])}
        className="btn-ghost mt-3"
      >
        <IconeMais size={13} />
        Adicionar contato
      </button>

      {linhas.length === 0 && (
        <Nota>
          Cadastre ao menos uma pessoa para ser acionada em caso de acidente. Contatos sem nome ou
          sem telefone são ignorados ao salvar.
        </Nota>
      )}
    </div>
  )
}
