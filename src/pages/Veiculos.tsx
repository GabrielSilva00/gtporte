import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useVeiculos } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { badgeVeiculo } from '../lib/format'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeBusca, IconeMais, IconeVeiculo } from '../components/icons'
import type { StatusVeiculo, Veiculo } from '../lib/types'

interface Formulario {
  placa: string
  modelo: string
  ano: string
  capacidade_maxima: string
  status: StatusVeiculo
  observacao: string
}

const VAZIO: Formulario = {
  placa: '',
  modelo: '',
  ano: '',
  capacidade_maxima: '',
  status: 'disponivel',
  observacao: '',
}

/** RF05 — cadastro e manutenção da frota municipal. */
export default function Veiculos() {
  const { data: veiculos, isLoading, error } = useVeiculos()
  const qc = useQueryClient()
  const toast = useToast()

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Veiculo | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        placa: form.placa.trim().toUpperCase(),
        modelo: form.modelo.trim(),
        ano: form.ano ? Number(form.ano) : null,
        capacidade_maxima: Number(form.capacidade_maxima),
        status: form.status,
        observacao: form.observacao.trim() || null,
      }
      const resposta = editando
        ? await supabase.from('veiculo').update(payload).eq('id', editando.id)
        : await supabase.from('veiculo').insert(payload)
      if (resposta.error) throw resposta.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['veiculos'] })
      qc.invalidateQueries({ queryKey: ['ocupacao-rotas'] })
      toast.sucesso(editando ? 'Veículo atualizado.' : 'Veículo cadastrado.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirNovo() {
    setEditando(null)
    setForm(VAZIO)
    setAberto(true)
  }

  function abrirEdicao(v: Veiculo) {
    setEditando(v)
    setForm({
      placa: v.placa,
      modelo: v.modelo,
      ano: v.ano?.toString() ?? '',
      capacidade_maxima: v.capacidade_maxima.toString(),
      status: v.status,
      observacao: v.observacao ?? '',
    })
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
  }
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusVeiculo>('todos')


  const valido =
    form.placa.trim().length >= 7 &&
    form.modelo.trim().length > 0 &&
    Number(form.capacidade_maxima) > 0

  const contadores = useMemo(() => {
    const base: Record<'todos' | StatusVeiculo, number> = {
      todos: veiculos?.length ?? 0,
      disponivel: 0,
      em_rota: 0,
      manutencao: 0,
    }
    for (const v of veiculos ?? []) base[v.status] += 1
    return base
  }, [veiculos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (veiculos ?? []).filter((v) => {
      if (filtroStatus !== 'todos' && v.status !== filtroStatus) return false
      if (!termo) return true
      return `${v.placa} ${v.modelo}`.toLowerCase().includes(termo)
    })
  }, [veiculos, filtroStatus, busca])

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Veículos</h1>
          <div className="mt-1 text-[13px] text-muted">
            Frota municipal · {veiculos?.length ?? 0} cadastrados · {filtrados.length} no filtro
          </div>
        </div>
        <button onClick={abrirNovo} className="btn-primary">
          <IconeMais size={14} />
          Novo veículo
        </button>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoCards itens={6} altura={104} />}

      {veiculos && veiculos.length === 0 && (
        <Vazio titulo="Nenhum veículo cadastrado" descricao="Cadastre a frota para poder criar rotas." />
      )}

      {veiculos && veiculos.length > 0 && (
        <div className="card mb-3.5 flex flex-wrap items-center gap-3 p-3.5">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft">
              <IconeBusca size={15} />
            </span>
            <input
              className="field pl-9"
              placeholder="Placa ou modelo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Tabs
            variante="pilulas"
            abas={[
              { chave: 'todos', rotulo: 'Todos', contador: contadores.todos },
              { chave: 'disponivel', rotulo: 'Disponível', contador: contadores.disponivel },
              { chave: 'em_rota', rotulo: 'Em rota', contador: contadores.em_rota },
              { chave: 'manutencao', rotulo: 'Manutenção', contador: contadores.manutencao },
            ]}
            ativa={filtroStatus}
            onMudar={setFiltroStatus}
          />
        </div>
      )}

      {veiculos && veiculos.length > 0 && filtrados.length === 0 && (
        <Vazio titulo="Nenhum veículo no filtro" descricao="Ajuste a busca ou a situação selecionada." />
      )}

      {filtrados.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((v) => (
            <button
              key={v.id}
              onClick={() => abrirEdicao(v)}
              className="card flex gap-3.5 p-4 text-left transition-colors hover:border-primary/30"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-tint text-primary">
                <IconeVeiculo size={26} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-[14px] font-semibold tracking-[0.04em]">
                      {v.placa}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {v.modelo}
                      {v.ano ? ` · ${v.ano}` : ''}
                    </div>
                  </div>
                  <Badge estilo={badgeVeiculo(v.status)} mono />
                </div>
                <div className="mt-2.5 flex gap-3.5 text-[11.5px]">
                  <div>
                    <div className="text-soft">Capacidade</div>
                    <div className="mt-px font-mono font-semibold">{v.capacidade_maxima} lugares</div>
                  </div>
                  {v.observacao && (
                    <div className="min-w-0">
                      <div className="text-soft">Observação</div>
                      <div className="mt-px truncate">{v.observacao}</div>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar ${editando.placa}` : 'Novo veículo'}
        descricao="A capacidade máxima é o limite usado pela distribuição automática."
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
              {salvar.isPending ? 'Salvando…' : 'Salvar veículo'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">Placa</span>
            <input
              value={form.placa}
              onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              placeholder="ABC-1234"
              maxLength={8}
              className="field font-mono"
            />
          </label>
          <label>
            <span className="field-label">Modelo</span>
            <input
              value={form.modelo}
              onChange={(e) => setForm({ ...form, modelo: e.target.value })}
              placeholder="Mercedes O-500"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Ano</span>
            <input
              type="number"
              min={1980}
              max={2100}
              value={form.ano}
              onChange={(e) => setForm({ ...form, ano: e.target.value })}
              placeholder="2020"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Capacidade máxima</span>
            <input
              type="number"
              min={1}
              value={form.capacidade_maxima}
              onChange={(e) => setForm({ ...form, capacidade_maxima: e.target.value })}
              placeholder="44"
              className="field"
            />
          </label>
          <label className="col-span-2">
            <span className="field-label">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StatusVeiculo })}
              className="field"
            >
              <option value="disponivel">Disponível</option>
              <option value="em_rota">Em rota</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </label>
          <label className="col-span-2">
            <span className="field-label">Observação</span>
            <textarea
              rows={2}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Veículo reserva, restrições etc."
              className="field resize-none"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
