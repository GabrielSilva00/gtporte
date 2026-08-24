import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { emailDeAcesso, mensagemErro, supabase, supabaseCadastro } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { CATEGORIAS, PAGINAS_CONCEDIVEIS, type ChavePagina } from '../lib/paginas'
import { Avatar } from '../components/ui/Avatar'
import { Badge, StatusPonto } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { CarregandoTabela, ErroCarregamento } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeChave, IconeEngrenagem, IconeInfo, IconeMais, IconeMotorista, IconeRelogio } from '../components/icons'
import { ROTULO_TIPO_PERFIL, type Perfil, type TipoPerfil } from '../lib/types'

const BADGE_PERFIL: Record<TipoPerfil, { bg: string; fg: string }> = {
  admin: { bg: '#EEF1EF', fg: '#1F3A2E' },
  operador: { bg: '#F4EAE1', fg: '#8A5A15' },
  motorista: { bg: '#EAF3EC', fg: '#2E7D5A' },
  estudante: { bg: '#EEF1EF', fg: '#6B7570' },
}

const FORM_VAZIO = {
  nome: '',
  login: '',
  senha: '',
  email: '',
  telefone: '',
  tipo: 'operador' as TipoPerfil,
}

/** RF20 — gerenciamento de perfis de acesso. Restrito a administradores. */
export default function Funcionarios() {
  const qc = useQueryClient()
  const toast = useToast()

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [liberadas, setLiberadas] = useState<Set<ChavePagina>>(new Set())
  /** Perfil cujo modal de acessos está aberto — independente do modal de edição. */
  const [acessosDe, setAcessosDe] = useState<Perfil | null>(null)

  const { data: perfis, isLoading, error } = useQuery({
    queryKey: ['perfis'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('perfil')
        .select('*')
        .neq('tipo', 'estudante')
        .order('nome')
      if (err) throw err
      return data as Perfil[]
    },
  })

  // Permissões do perfil em edição — carregadas só quando o modal abre
  const perfilEmFoco = acessosDe ?? editando
  const { data: permissoesSalvas } = useQuery({
    queryKey: ['permissoes-perfil', perfilEmFoco?.id],
    enabled: !!perfilEmFoco,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('permissao_pagina')
        .select('pagina')
        .eq('perfil_id', perfilEmFoco!.id)
      if (err) throw err
      return data.map((p) => p.pagina as ChavePagina)
    },
  })

  useEffect(() => {
    setLiberadas(new Set(permissoesSalvas ?? []))
  }, [permissoesSalvas])

  const contadores = useMemo(() => {
    const c = { admin: 0, operador: 0, motorista: 0 }
    ;(perfis ?? []).forEach((p) => {
      if (p.tipo in c) c[p.tipo as keyof typeof c]++
    })
    return c
  }, [perfis])

  /**
   * Aplica apenas a diferença entre o que está salvo e o que está marcado.
   * A versão anterior apagava tudo e reinseria: se o insert falhasse depois
   * do delete, o funcionário ficava sem nenhuma permissão.
   */
  async function gravarPermissoes(perfilId: string) {
    const salvas = new Set(permissoesSalvas ?? [])
    const incluir = [...liberadas].filter((p) => !salvas.has(p))
    const remover = [...salvas].filter((p) => !liberadas.has(p))

    if (incluir.length > 0) {
      const { error: erroInsercao } = await supabase
        .from('permissao_pagina')
        .insert(incluir.map((pagina) => ({ perfil_id: perfilId, pagina })))
      if (erroInsercao) throw erroInsercao
    }

    if (remover.length > 0) {
      const { error: erroRemocao } = await supabase
        .from('permissao_pagina')
        .delete()
        .eq('perfil_id', perfilId)
        .in('pagina', remover)
      if (erroRemocao) throw erroRemocao
    }
  }

  /** Salva só as permissões, sem passar pelo formulário de dados do perfil. */
  const salvarAcessos = useMutation({
    mutationFn: async () => {
      if (!acessosDe) return
      await gravarPermissoes(acessosDe.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissoes-perfil'] })
      qc.invalidateQueries({ queryKey: ['perfis'] })
      toast.sucesso('Acessos atualizados.')
      setAcessosDe(null)
      setLiberadas(new Set())
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirAcessos(p: Perfil) {
    setAcessosDe(p)
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (editando) {
        const { error: err } = await supabase
          .from('perfil')
          .update({
            nome: form.nome.trim(),
            telefone: form.telefone.trim() || null,
            tipo: form.tipo,
          })
          .eq('id', editando.id)
        if (err) throw err

        if (form.tipo !== 'admin') await gravarPermissoes(editando.id)
        return
      }

      // Criação do acesso: o administrador define login e senha; o e-mail é
      // opcional. O Supabase Auth exige um endereço, então sem e-mail real
      // usamos <login>@gtporte.local apenas como identificador.
      const login = form.login.trim().toLowerCase()
      if (login.length < 3) throw new Error('Informe um login com pelo menos 3 caracteres.')
      if (/\s/.test(login)) throw new Error('O login não pode conter espaços.')
      if (form.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')

      // supabaseCadastro é um cliente sem sessão persistida: assim o signUp
      // não substitui a sessão do administrador que está no painel.
      const { data, error: err } = await supabaseCadastro.auth.signUp({
        email: emailDeAcesso(login, form.email),
        password: form.senha,
        options: {
          data: {
            nome: form.nome.trim(),
            login,
            tipo: form.tipo,
            telefone: form.telefone.trim() || null,
          },
        },
      })
      if (err) throw err
      if (!data.user) throw new Error('Não foi possível criar o acesso. Tente novamente.')

      // O perfil é criado pelo trigger handle_new_user(); as permissões vêm depois.
      if (form.tipo !== 'admin' && liberadas.size > 0) {
        await gravarPermissoes(data.user.id)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis'] })
      qc.invalidateQueries({ queryKey: ['perfis-motorista'] })
      qc.invalidateQueries({ queryKey: ['permissoes-perfil'] })
      toast.sucesso(editando ? 'Perfil atualizado.' : 'Acesso criado.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const alternarAtivo = useMutation({
    mutationFn: async (p: Perfil) => {
      const { error: err } = await supabase
        .from('perfil')
        .update({ ativo: !p.ativo })
        .eq('id', p.id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis'] })
      toast.sucesso('Status do acesso alterado.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirEdicao(p: Perfil) {
    setEditando(p)
    setForm({
      nome: p.nome,
      login: p.login ?? '',
      senha: '',
      email: p.email,
      telefone: p.telefone ?? '',
      tipo: p.tipo,
    })
    setAberto(true)
  }

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_VAZIO)
    setLiberadas(new Set())
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
    setLiberadas(new Set())
  }

  /** Marca ou desmarca de uma vez todas as páginas de uma categoria. */
  function alternarCategoria(chaves: ChavePagina[], marcar: boolean) {
    setLiberadas((atual) => {
      const proxima = new Set(atual)
      chaves.forEach((c) => (marcar ? proxima.add(c) : proxima.delete(c)))
      return proxima
    })
  }

  function alternarPagina(chave: ChavePagina) {
    setLiberadas((atual) => {
      const proxima = new Set(atual)
      if (proxima.has(chave)) proxima.delete(chave)
      else proxima.add(chave)
      return proxima
    })
  }

  const cards = [
    { valor: contadores.admin, rotulo: 'administradores', Icone: IconeEngrenagem, bg: '#EEF1EF', fg: '#1F3A2E' },
    { valor: contadores.operador, rotulo: 'operadores', Icone: IconeRelogio, bg: '#F4EAE1', fg: '#C4633A' },
    { valor: contadores.motorista, rotulo: 'motoristas', Icone: IconeMotorista, bg: '#EAF3EC', fg: '#2E7D5A' },
  ]

  // Administrador enxerga tudo por definição; motorista não usa este painel.
  const permissoesAplicaveis = form.tipo === 'operador'
  const podeSalvar = editando
    ? form.nome.trim().length > 2
    : form.nome.trim().length > 2 && form.login.trim().length >= 3 && form.senha.length >= 6

  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Funcionários &amp; acessos</h1>
          <div className="mt-1 text-[13px] text-muted">
            O perfil define o que cada usuário enxerga no sistema (RF20).
          </div>
        </div>
        <button onClick={abrirNovo} className="btn-primary">
          <IconeMais size={14} />
          Novo funcionário
        </button>
      </div>

      <div className="my-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map(({ valor, rotulo, Icone, bg, fg }) => (
          <div key={rotulo} className="card flex items-center gap-3 p-4">
            <div
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px]"
              style={{ background: bg, color: fg }}
            >
              <Icone size={18} />
            </div>
            <div>
              <div className="text-[20px] font-semibold">{valor}</div>
              <div className="text-[11.5px] text-muted">{rotulo}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela linhas={5} />}

      {perfis && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Nome</th>
                <th className="th">Login</th>
                <th className="th">Perfil</th>
                <th className="th">Último acesso</th>
                <th className="th">Status</th>
                <th className="th w-px" />
              </tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => abrirEdicao(p)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-bg"
                >
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={p.nome} />
                      <span className="font-medium">{p.nome}</span>
                    </div>
                  </td>
                  <td className="td font-mono text-[12px] text-muted">
                    {p.login ?? p.email}
                  </td>
                  <td className="td">
                    <Badge
                      estilo={{ rotulo: ROTULO_TIPO_PERFIL[p.tipo], ...BADGE_PERFIL[p.tipo] }}
                    />
                  </td>
                  <td className="td font-mono text-[12px] text-muted">
                    {dataHoraBR(p.ultimo_acesso)}
                  </td>
                  <td className="td">
                    <StatusPonto
                      cor={p.ativo ? '#2E7D5A' : '#6B7570'}
                      texto={p.ativo ? 'Ativo' : 'Inativo'}
                    />
                  </td>
                  <td className="td text-right">
                    {p.tipo === 'operador' ? (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          abrirAcessos(p)
                        }}
                        className="btn-ghost whitespace-nowrap px-2.5 py-1.5 text-[11.5px]"
                        title="Liberar ou bloquear páginas específicas"
                      >
                        <IconeChave size={13} />
                        Acessos
                      </button>
                    ) : (
                      <span className="pr-1 text-[11.5px] text-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {perfis.length === 0 && (
                <tr>
                  <td colSpan={6} className="td py-10 text-center text-muted">
                    Nenhum funcionário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar ${editando.nome}` : 'Novo funcionário'}
        descricao={
          editando
            ? 'Altere o perfil e as páginas liberadas para este usuário.'
            : 'Defina login e senha de acesso; o e-mail é opcional.'
        }
        largura={680}
        onFechar={fechar}
        rodape={
          <>
            {editando && (
              <button
                onClick={() => alternarAtivo.mutate(editando)}
                disabled={alternarAtivo.isPending}
                className="btn-ghost mr-auto"
              >
                {editando.ativo ? 'Bloquear acesso' : 'Liberar acesso'}
              </button>
            )}
            <button onClick={fechar} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvar.mutate()}
              disabled={!podeSalvar || salvar.isPending}
              className="btn-primary"
            >
              {salvar.isPending
                ? 'Salvando…'
                : editando
                  ? 'Salvar alterações'
                  : 'Criar acesso'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="field-label">Nome completo</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Como consta no registro funcional"
              className="field"
            />
          </label>

          <label>
            <span className="field-label">Login</span>
            <input
              value={form.login}
              onChange={(e) =>
                setForm({ ...form, login: e.target.value.toLowerCase().replace(/\s/g, '') })
              }
              disabled={!!editando}
              placeholder="marina.rocha"
              className="field font-mono disabled:opacity-60"
            />
            <span className="mt-1 block text-[11.5px] text-muted">
              {editando ? 'O login não muda depois de criado.' : 'É com ele que o funcionário entra no sistema.'}
            </span>
          </label>

          <label>
            <span className="field-label">{editando ? 'Senha' : 'Senha inicial'}</span>
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              disabled={!!editando}
              placeholder={editando ? 'Alterada pelo próprio usuário' : 'mínimo 6 caracteres'}
              className="field disabled:opacity-60"
            />
          </label>

          <label className="col-span-2">
            <span className="field-label">E-mail (opcional)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!editando}
              placeholder="nome@aracatuba.sp.gov.br"
              className="field disabled:opacity-60"
            />
            <span className="mt-1 block text-[11.5px] text-muted">
              Sem e-mail o sistema usa <code className="font-mono">{'<login>@gtporte.local'}</code>,
              que serve apenas como identificador interno.
            </span>
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
            <span className="field-label">Perfil de acesso</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPerfil })}
              className="field"
            >
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="motorista">Motorista</option>
            </select>
          </label>
        </div>

        {/* Permissões por página (RF20) */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="field-label">Páginas liberadas</div>

          {permissoesAplicaveis ? (
            <>
              <p className="mb-2.5 text-[11.5px] text-muted">
                O operador só enxerga no menu — e só consegue abrir — as páginas marcadas aqui.
              </p>
              <GradePermissoes
                liberadas={liberadas}
                onAlternar={alternarPagina}
                onAlternarCategoria={alternarCategoria}
              />
            </>
          ) : (
            <div className="mt-1.5 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
              <span className="mt-px shrink-0 text-primary">
                <IconeInfo size={15} />
              </span>
              {form.tipo === 'admin' ? (
                <span>
                  <b>Administrador</b> tem acesso total ao painel, incluindo cadastro de rotas,
                  aprovação de documentos e esta própria tela. Não há o que restringir.
                </span>
              ) : (
                <span>
                  <b>Motorista</b> não usa o painel administrativo. Ele entra no painel próprio,
                  com as rotas em que estiver vinculado no cadastro de Motoristas.
                </span>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/*
        Modal dedicado a acessos: permite liberar e bloquear páginas de um
        funcionário já cadastrado sem passar pelo formulário de dados dele.
      */}
      <Modal
        aberto={!!acessosDe}
        titulo={acessosDe ? `Acessos de ${acessosDe.nome}` : 'Acessos'}
        descricao="O operador só enxerga no menu — e só consegue abrir — as páginas marcadas."
        largura={680}
        onFechar={() => {
          setAcessosDe(null)
          setLiberadas(new Set())
        }}
        rodape={
          <>
            <button
              onClick={() => alternarCategoria(PAGINAS_CONCEDIVEIS.map((p) => p.chave), false)}
              className="btn-ghost mr-auto text-danger"
            >
              Bloquear tudo
            </button>
            <button
              onClick={() => {
                setAcessosDe(null)
                setLiberadas(new Set())
              }}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button
              onClick={() => salvarAcessos.mutate()}
              disabled={salvarAcessos.isPending}
              className="btn-primary"
            >
              {salvarAcessos.isPending ? 'Salvando…' : 'Salvar acessos'}
            </button>
          </>
        }
      >
        <div className="mb-3 flex items-center justify-between rounded-field bg-tint px-3.5 py-2.5">
          <span className="text-[12.5px] text-muted">
            {liberadas.size} de {PAGINAS_CONCEDIVEIS.length} páginas liberadas
          </span>
          <button
            onClick={() => alternarCategoria(PAGINAS_CONCEDIVEIS.map((p) => p.chave), true)}
            className="text-[11.5px] font-medium text-primary hover:text-primary-hover"
          >
            liberar todas
          </button>
        </div>

        <GradePermissoes
          liberadas={liberadas}
          onAlternar={alternarPagina}
          onAlternarCategoria={alternarCategoria}
        />
      </Modal>
    </div>
  )
}

/**
 * Grade de páginas por categoria. Usada tanto no cadastro do funcionário
 * quanto no modal de acessos, que edita só as permissões.
 */
function GradePermissoes({
  liberadas,
  onAlternar,
  onAlternarCategoria,
}: {
  liberadas: Set<ChavePagina>
  onAlternar: (chave: ChavePagina) => void
  onAlternarCategoria: (chaves: ChavePagina[], marcar: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {CATEGORIAS.map((categoria) => {
        const daCategoria = PAGINAS_CONCEDIVEIS.filter((p) => p.categoria === categoria)
        if (daCategoria.length === 0) return null
        const todas = daCategoria.every((p) => liberadas.has(p.chave))

        return (
          <div key={categoria} className="rounded-field border border-edge p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                {categoria}
              </span>
              <button
                onClick={() => onAlternarCategoria(daCategoria.map((p) => p.chave), !todas)}
                className="text-[11.5px] font-medium text-primary hover:text-primary-hover"
              >
                {todas ? 'desmarcar todas' : 'marcar todas'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {daCategoria.map(({ chave, rotulo, Icone }) => (
                <label
                  key={chave}
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] hover:bg-tint"
                >
                  <input
                    type="checkbox"
                    checked={liberadas.has(chave)}
                    onChange={() => onAlternar(chave)}
                    className="h-3.5 w-3.5 accent-[#1F3A2E]"
                  />
                  <span className="text-soft">
                    <Icone size={14} />
                  </span>
                  <span className="truncate">{rotulo}</span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
