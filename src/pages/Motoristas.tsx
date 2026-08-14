import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMotoristas, useRotas } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { badgeMotorista, dataBR } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeInfo, IconeMais } from '../components/icons'
import type { Motorista, Perfil, StatusMotorista } from '../lib/types'

interface Formulario {
  nome: string
  cnh: string
  categoria_cnh: string
  validade_cnh: string
  telefone: string
  status: StatusMotorista
  perfil_id: string
}

const VAZIO: Formulario = {
  nome: '',
  cnh: '',
  categoria_cnh: 'D',
  validade_cnh: '',
  telefone: '',
  status: 'aguardando',
  perfil_id: '',
}

/** RF04 — cadastro e gerenciamento de motoristas. */
export default function Motoristas() {
  const { data: motoristas, isLoading, error } = useMotoristas()
  const { data: rotas } = useRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Motorista | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)

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

  const vinculados = new Set(
    (motoristas ?? []).map((m) => m.perfil_id).filter((id): id is string => !!id),
  )

  // Perfis de motorista ainda livres, mais o que já está selecionado no formulário
  const disponiveis = (perfisMotorista ?? []).filter(
    (p) => p.id === form.perfil_id || !vinculados.has(p.id),
  )
  const acessoSelecionado = perfisMotorista?.find((p) => p.id === form.perfil_id) ?? null

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        cnh: form.cnh.trim(),
        categoria_cnh: form.categoria_cnh,
        validade_cnh: form.validade_cnh || null,
        telefone: form.telefone.trim() || null,
        status: form.status,
        perfil_id: form.perfil_id || null,
      }
      const resposta = editando
        ? await supabase.from('motorista').update(payload).eq('id', editando.id)
        : await supabase.from('motorista').insert(payload)
      if (resposta.error) throw resposta.error
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
    setAberto(true)
  }

  function abrirEdicao(m: Motorista) {
    setEditando(m)
    setForm({
      nome: m.nome,
      cnh: m.cnh,
      categoria_cnh: m.categoria_cnh,
      validade_cnh: m.validade_cnh ?? '',
      telefone: m.telefone ?? '',
      status: m.status,
      perfil_id: m.perfil_id ?? '',
    })
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
  }

  const valido = form.nome.trim().length > 2 && form.cnh.trim().length >= 9

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Motoristas</h1>
          <div className="mt-1 text-[13px] text-muted">
            Equipe operacional · {motoristas?.length ?? 0} cadastrados
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
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-edge">
                <th className="th">Motorista</th>
                <th className="th">CNH</th>
                <th className="th">Cat.</th>
                <th className="th">Validade</th>
                <th className="th">Rota</th>
                <th className="th">Telefone</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {motoristas.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => abrirEdicao(m)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-bg"
                >
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={m.nome} />
                      <span className="font-medium">{m.nome}</span>
                    </div>
                  </td>
                  <td className="td font-mono text-muted">{m.cnh}</td>
                  <td className="td">
                    <span className="rounded-[5px] bg-tint px-1.5 py-0.5 font-mono text-[11.5px]">
                      {m.categoria_cnh}
                    </span>
                  </td>
                  <td className="td font-mono text-[12px] text-muted">{dataBR(m.validade_cnh)}</td>
                  <td className="td font-mono font-medium text-primary">
                    {rotaPorMotorista.get(m.id) ?? '-'}
                  </td>
                  <td className="td font-mono text-[12px] text-muted">{m.telefone ?? '-'}</td>
                  <td className="td">
                    <Badge estilo={badgeMotorista(m.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar ${editando.nome}` : 'Novo motorista'}
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
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className="field-label">Nome completo</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Como consta na CNH"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Número da CNH</span>
            <input
              value={form.cnh}
              onChange={(e) => setForm({ ...form, cnh: e.target.value.replace(/\D/g, '') })}
              placeholder="00000000000"
              maxLength={11}
              className="field font-mono"
            />
          </label>
          <label>
            <span className="field-label">Categoria</span>
            <select
              value={form.categoria_cnh}
              onChange={(e) => setForm({ ...form, categoria_cnh: e.target.value })}
              className="field"
            >
              {['A', 'B', 'C', 'D', 'E'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Validade da CNH</span>
            <input
              type="date"
              value={form.validade_cnh}
              onChange={(e) => setForm({ ...form, validade_cnh: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Telefone</span>
            <input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="(18) 99999-0000"
              className="field"
            />
          </label>
          <label className="col-span-2">
            <span className="field-label">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StatusMotorista })}
              className="field"
            >
              <option value="aguardando">Aguardando</option>
              <option value="em_rota">Em rota</option>
              <option value="folga">Folga</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>

          <label className="col-span-2">
            <span className="field-label">Usuário de acesso</span>
            <select
              value={form.perfil_id}
              onChange={(e) => setForm({ ...form, perfil_id: e.target.value })}
              className="field"
            >
              <option value="">Sem acesso ao painel</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.login ?? p.email} · {p.nome}
                  {p.ativo ? '' : ' (bloqueado)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Estado real do acesso — evita salvar um vínculo que não vai funcionar */}
        <div className="mt-4 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          {acessoSelecionado ? (
            <div>
              <div>
                Acesso vinculado: <b>{acessoSelecionado.nome}</b> · login{' '}
                <code className="font-mono">{acessoSelecionado.login ?? '—'}</code>
                {acessoSelecionado.email &&
                  !acessoSelecionado.email.endsWith('@gtporte.local') && (
                    <> · {acessoSelecionado.email}</>
                  )}
              </div>
              <div className="mt-1">
                Situação:{' '}
                <b style={{ color: acessoSelecionado.ativo ? '#2E7D5A' : '#9E3E3E' }}>
                  {acessoSelecionado.ativo ? 'ativo' : 'bloqueado'}
                </b>
                {!acessoSelecionado.ativo && ' — libere o acesso em Funcionários para ele entrar.'}
              </div>
            </div>
          ) : disponiveis.length === 0 ? (
            <div>
              Nenhum usuário com perfil <b>Motorista</b> disponível. Crie o acesso em{' '}
              <b>Funcionários → Novo funcionário</b>, definindo login, senha e o perfil
              Motorista; ele passa a aparecer nesta lista.
            </div>
          ) : (
            <div>
              Sem usuário vinculado o motorista não enxerga nenhuma rota no painel dele. O
              acesso (login e senha) é criado em <b>Funcionários</b> e selecionado aqui.
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
