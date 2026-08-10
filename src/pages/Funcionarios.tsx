import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Badge, StatusPonto } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { CarregandoTabela, ErroCarregamento } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeEngrenagem, IconeInfo, IconeMais, IconeMotorista, IconeRelogio } from '../components/icons'
import { ROTULO_TIPO_PERFIL, type Perfil, type TipoPerfil } from '../lib/types'

const BADGE_PERFIL: Record<TipoPerfil, { bg: string; fg: string }> = {
  admin: { bg: '#EEF1EF', fg: '#1F3A2E' },
  operador: { bg: '#F4EAE1', fg: '#8A5A15' },
  motorista: { bg: '#EAF3EC', fg: '#2E7D5A' },
  estudante: { bg: '#EEF1EF', fg: '#6B7570' },
}

/** RF20 — gerenciamento de perfis de acesso. Restrito a administradores. */
export default function Funcionarios() {
  const qc = useQueryClient()
  const toast = useToast()

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    tipo: 'operador' as TipoPerfil,
  })

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

  const contadores = useMemo(() => {
    const c = { admin: 0, operador: 0, motorista: 0 }
    ;(perfis ?? []).forEach((p) => {
      if (p.tipo in c) c[p.tipo as keyof typeof c]++
    })
    return c
  }, [perfis])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!editando) {
        // Criação de acesso: o usuário precisa existir no Supabase Auth.
        // O convite por e-mail exige a service_role key, que não pode ficar
        // no front-end — por isso a criação é feita pelo Dashboard do Supabase
        // e aqui apenas ajustamos o perfil correspondente.
        throw new Error(
          'Crie o usuário em Authentication > Users no painel do Supabase com ' +
            `"tipo": "${form.tipo}" em User Metadata. O perfil aparece aqui automaticamente.`,
        )
      }
      const { error: err } = await supabase
        .from('perfil')
        .update({
          nome: form.nome.trim(),
          telefone: form.telefone.trim() || null,
          tipo: form.tipo,
        })
        .eq('id', editando.id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis'] })
      toast.sucesso('Perfil atualizado.')
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
    setForm({ nome: p.nome, email: p.email, telefone: p.telefone ?? '', tipo: p.tipo })
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
  }

  const cards = [
    { valor: contadores.admin, rotulo: 'administradores', Icone: IconeEngrenagem, bg: '#EEF1EF', fg: '#1F3A2E' },
    { valor: contadores.operador, rotulo: 'operadores', Icone: IconeRelogio, bg: '#F4EAE1', fg: '#C4633A' },
    { valor: contadores.motorista, rotulo: 'motoristas', Icone: IconeMotorista, bg: '#EAF3EC', fg: '#2E7D5A' },
  ]

  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Funcionários &amp; acessos</h1>
          <div className="mt-1 text-[13px] text-muted">
            O perfil define o que cada usuário enxerga no sistema (RF20).
          </div>
        </div>
        <button
          onClick={() => {
            setEditando(null)
            setForm({ nome: '', email: '', telefone: '', tipo: 'operador' })
            setAberto(true)
          }}
          className="btn-primary"
        >
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
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Nome</th>
                <th className="th">E-mail</th>
                <th className="th">Perfil</th>
                <th className="th">Último acesso</th>
                <th className="th">Status</th>
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
                  <td className="td font-mono text-[12px] text-muted">{p.email}</td>
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
                </tr>
              ))}
              {perfis.length === 0 && (
                <tr>
                  <td colSpan={5} className="td py-10 text-center text-muted">
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
        largura={620}
        onFechar={fechar}
        rodape={
          <>
            {editando && (
              <button
                onClick={() => alternarAtivo.mutate(editando)}
                disabled={alternarAtivo.isPending}
                className="btn-ghost mr-auto"
              >
                {editando.ativo ? 'Desativar acesso' : 'Reativar acesso'}
              </button>
            )}
            <button onClick={fechar} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending || (!editando && true)}
              className="btn-primary"
            >
              {editando ? 'Salvar alterações' : 'Criar acesso'}
            </button>
          </>
        }
      >
        {!editando && (
          <div className="mb-4 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
            <span className="mt-px shrink-0 text-primary">
              <IconeInfo size={15} />
            </span>
            <div>
              A criação de usuários exige a <b>service_role key</b>, que não pode ser exposta no
              navegador. Crie o usuário em <b>Authentication &gt; Users</b> no painel do Supabase,
              informando <code className="font-mono">{'{ "tipo": "operador", "nome": "…" }'}</code>{' '}
              em <b>User Metadata</b>. O perfil aparece nesta lista automaticamente e você poderá
              editá-lo aqui.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="field-label">Nome completo</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={!editando}
              className="field disabled:opacity-60"
            />
          </label>
          <label className="col-span-2">
            <span className="field-label">E-mail institucional</span>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled
              placeholder="nome@aracatuba.sp.gov.br"
              className="field opacity-60"
            />
            <span className="mt-1 block text-[11.5px] text-muted">
              O e-mail é gerenciado pelo Supabase Auth.
            </span>
          </label>
          <label>
            <span className="field-label">Telefone</span>
            <input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              disabled={!editando}
              placeholder="(18) 9 0000-0000"
              className="field disabled:opacity-60"
            />
          </label>
          <label>
            <span className="field-label">Perfil de acesso</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPerfil })}
              disabled={!editando}
              className="field disabled:opacity-60"
            >
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="motorista">Motorista</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-btn bg-tint px-3.5 py-3 text-[12px] leading-relaxed text-muted">
          <b>Administrador</b> tem acesso total, incluindo cadastro de rotas e aprovação de
          documentos. <b>Operador</b> opera o dia a dia sem essas duas permissões.{' '}
          <b>Motorista</b> não acessa este painel.
        </div>
      </Modal>
    </div>
  )
}
