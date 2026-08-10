import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useCidades,
  useMotoristas,
  useOcupacaoRotas,
  useRotas,
  useUniversidades,
  useVeiculos,
} from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { badgeRota, hora, percentual } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeInfo, IconeMais, IconeSeta } from '../components/icons'
import type { Rota, StatusRota } from '../lib/types'

interface Formulario {
  codigo: string
  nome: string
  cidade_origem_id: string
  cidade_destino_id: string
  universidade_ids: string[]
  veiculo_id: string
  motorista_id: string
  horario_partida: string
  horario_retorno: string
  descricao: string
  status: StatusRota
}

const VAZIO: Formulario = {
  codigo: '',
  nome: '',
  cidade_origem_id: '',
  cidade_destino_id: '',
  universidade_ids: [],
  veiculo_id: '',
  motorista_id: '',
  horario_partida: '',
  horario_retorno: '',
  descricao: '',
  status: 'ativa',
}

/**
 * RF08 — cadastro de rotas.
 * RN06: apenas administradores criam/alteram; operadores veem em leitura.
 * RN14: motorista responsável é obrigatório.
 */
export default function Rotas() {
  const { data: rotas, isLoading, error } = useRotas()
  const { data: ocupacoes } = useOcupacaoRotas()
  const { data: cidades } = useCidades()
  const { data: universidades } = useUniversidades()
  const { data: veiculos } = useVeiculos()
  const { data: motoristas } = useMotoristas()
  const { ehAdmin } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Rota | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)

  const ocupacaoPorRota = new Map((ocupacoes ?? []).map((o) => [o.rota_id, o]))

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        nome: form.nome.trim(),
        cidade_origem_id: form.cidade_origem_id,
        cidade_destino_id: form.cidade_destino_id,
        veiculo_id: form.veiculo_id,
        motorista_id: form.motorista_id,
        horario_partida: form.horario_partida,
        horario_retorno: form.horario_retorno,
        descricao: form.descricao.trim() || null,
        status: form.status,
      }
      let rotaId = editando?.id
      if (editando) {
        const { error: err } = await supabase.from('rota').update(payload).eq('id', editando.id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase
          .from('rota')
          .insert(payload)
          .select('id')
          .single()
        if (err) throw err
        rotaId = data.id
      }

      // Universidades atendidas: a lista e reescrita por inteiro a cada gravacao.
      const { error: erroLimpeza } = await supabase
        .from('rota_universidade')
        .delete()
        .eq('rota_id', rotaId!)
      if (erroLimpeza) throw erroLimpeza

      if (form.universidade_ids.length > 0) {
        const { error: erroVinculo } = await supabase.from('rota_universidade').insert(
          form.universidade_ids.map((universidade_id) => ({
            rota_id: rotaId!,
            universidade_id,
          })),
        )
        if (erroVinculo) throw erroVinculo
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rotas'] })
      qc.invalidateQueries({ queryKey: ['ocupacao-rotas'] })
      toast.sucesso(editando ? 'Rota atualizada.' : 'Rota cadastrada.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const inativar = useMutation({
    mutationFn: async (rota: Rota) => {
      const { error: err } = await supabase
        .from('rota')
        .update({ status: rota.status === 'inativa' ? 'ativa' : 'inativa' })
        .eq('id', rota.id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rotas'] })
      qc.invalidateQueries({ queryKey: ['ocupacao-rotas'] })
      toast.sucesso('Status da rota atualizado.')
      fechar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirNovo() {
    setEditando(null)
    setForm({ ...VAZIO, codigo: proximoCodigo(rotas ?? []) })
    setAberto(true)
  }

  function abrirEdicao(r: Rota) {
    setEditando(r)
    setForm({
      codigo: r.codigo,
      nome: r.nome,
      cidade_origem_id: r.cidade_origem_id,
      cidade_destino_id: r.cidade_destino_id,
      universidade_ids: (r.universidades ?? [])
        .map((v) => v.universidade?.id)
        .filter((id): id is string => !!id),
      veiculo_id: r.veiculo_id,
      motorista_id: r.motorista_id,
      horario_partida: hora(r.horario_partida),
      horario_retorno: hora(r.horario_retorno),
      descricao: r.descricao ?? '',
      status: r.status,
    })
    setAberto(true)
  }

  function fechar() {
    setAberto(false)
    setEditando(null)
  }

  const valido =
    form.codigo.trim() !== '' &&
    form.nome.trim() !== '' &&
    form.cidade_origem_id !== '' &&
    form.cidade_destino_id !== '' &&
    form.veiculo_id !== '' &&
    form.motorista_id !== '' &&
    form.horario_partida !== '' &&
    form.horario_retorno !== ''

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Rotas</h1>
          <div className="mt-1 text-[13px] text-muted">
            {rotas?.length ?? 0} rotas cadastradas
          </div>
        </div>
        {ehAdmin && (
          <button onClick={abrirNovo} className="btn-primary">
            <IconeMais size={14} />
            Nova rota
          </button>
        )}
      </div>

      {!ehAdmin && (
        <div className="mb-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3 text-[12.5px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          apenas administradores podem alterar rotas cadastradas. Você está em modo leitura.
        </div>
      )}

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoCards itens={4} altura={230} />}

      {rotas && rotas.length === 0 && (
        <Vazio
          titulo="Nenhuma rota cadastrada"
          descricao="Cadastre veículos e motoristas antes de criar a primeira rota."
        />
      )}

      {rotas && rotas.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rotas.map((r) => {
            const cap = r.veiculo?.capacidade_maxima ?? 0
            const usada = ocupacaoPorRota.get(r.id)?.ocupacao ?? 0
            const pct = percentual(usada, cap)
            return (
              <div key={r.id} className="card p-[18px]">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-primary">
                        {r.codigo}
                      </span>
                      <Badge estilo={badgeRota(r.status)} mono />
                    </div>
                    <div className="mt-1 text-[15px] font-semibold">{r.nome}</div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center gap-2.5 rounded-btn bg-tint p-3">
                  <div className="flex-1">
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Origem</div>
                    <div className="mt-0.5 text-[13px] font-medium">{r.origem?.nome ?? '-'}</div>
                    <div className="mt-0.5 font-mono text-[11.5px] text-primary">
                      {hora(r.horario_partida)}
                    </div>
                  </div>
                  <span className="text-accent">
                    <IconeSeta size={18} />
                  </span>
                  <div className="flex-1 text-right">
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Destino</div>
                    <div className="mt-0.5 text-[13px] font-medium">{r.destino?.nome ?? '-'}</div>
                    <div className="mt-0.5 font-mono text-[11.5px] text-primary">
                      retorno {hora(r.horario_retorno)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Motorista</div>
                    <div className="mt-0.5">{r.motorista?.nome ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Veículo</div>
                    <div className="mt-0.5 font-mono">{r.veiculo?.placa ?? '-'}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">
                    Universidades atendidas
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(r.universidades ?? []).length === 0 ? (
                      <span className="text-[12px] text-muted">Todas</span>
                    ) : (
                      (r.universidades ?? []).map((v) => (
                        <span
                          key={v.universidade?.id}
                          className="rounded-full bg-tint px-2 py-0.5 text-[11.5px]"
                        >
                          {v.universidade?.nome}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <div className="text-[11px] text-muted">Ocupação</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[14px] font-semibold">
                        {usada}
                        <span className="text-muted">/{cap}</span>
                      </span>
                      <ProgressBar percentual={pct} altura={5} largura={70} />
                    </div>
                  </div>
                  {ehAdmin && (
                    <button onClick={() => abrirEdicao(r)} className="btn-ghost px-3 py-1.5 text-[12px]">
                      Editar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar rota ${editando.codigo}` : 'Nova rota'}
        descricao="A grade de horários define a compatibilidade com os estudantes na distribuição automática."
        largura={720}
        onFechar={fechar}
        rodape={
          <>
            {editando && (
              <button
                onClick={() => inativar.mutate(editando)}
                disabled={inativar.isPending}
                className="btn-danger mr-auto"
              >
                {editando.status === 'inativa' ? 'Reativar rota' : 'Inativar rota'}
              </button>
            )}
            <button onClick={fechar} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvar.mutate()}
              disabled={!valido || salvar.isPending}
              className="btn-primary"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar rota'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">Código</span>
            <input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              placeholder="R07"
              className="field font-mono"
            />
          </label>
          <label>
            <span className="field-label">Nome da rota</span>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Araçatuba → UNESP"
              className="field"
            />
          </label>

          <label>
            <span className="field-label">Cidade de origem</span>
            <select
              value={form.cidade_origem_id}
              onChange={(e) => setForm({ ...form, cidade_origem_id: e.target.value })}
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
          <label>
            <span className="field-label">Cidade de destino</span>
            <select
              value={form.cidade_destino_id}
              onChange={(e) => setForm({ ...form, cidade_destino_id: e.target.value })}
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

          <div className="col-span-2">
            <span className="field-label">Universidades atendidas</span>
            <div className="mt-1 grid grid-cols-1 gap-1.5 rounded-field border border-edge p-2.5 sm:grid-cols-2">
              {universidades?.map((u) => {
                const marcada = form.universidade_ids.includes(u.id)
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] hover:bg-tint"
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          universidade_ids: e.target.checked
                            ? [...form.universidade_ids, u.id]
                            : form.universidade_ids.filter((id) => id !== u.id),
                        })
                      }
                      className="h-3.5 w-3.5 accent-[#1F3A2E]"
                    />
                    <span className="truncate">{u.nome}</span>
                  </label>
                )
              })}
            </div>
            <span className="mt-1 block text-[11.5px] text-muted">
              {form.universidade_ids.length === 0
                ? 'Nenhuma marcada: a rota atende estudantes de qualquer instituição.'
                : `Restringe a distribuição automática a ${form.universidade_ids.length} instituição(ões).`}
            </span>
          </div>

          <label>
            <span className="field-label">Veículo</span>
            <select
              value={form.veiculo_id}
              onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })}
              className="field"
            >
              <option value="">Selecione…</option>
              {veiculos?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} · {v.capacidade_maxima} lugares
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Motorista responsável</span>
            <select
              value={form.motorista_id}
              onChange={(e) => setForm({ ...form, motorista_id: e.target.value })}
              className="field"
            >
              <option value="">Selecione…</option>
              {motoristas?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} · CNH {m.categoria_cnh}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Horário de partida</span>
            <input
              type="time"
              value={form.horario_partida}
              onChange={(e) => setForm({ ...form, horario_partida: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Horário de retorno</span>
            <input
              type="time"
              value={form.horario_retorno}
              onChange={(e) => setForm({ ...form, horario_retorno: e.target.value })}
              className="field"
            />
          </label>

          <label className="col-span-2">
            <span className="field-label">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StatusRota })}
              className="field"
            >
              <option value="ativa">Ativa</option>
              <option value="revisao">Em revisão</option>
              <option value="lotada">Lotada</option>
              <option value="inativa">Inativa</option>
            </select>
          </label>

          <label className="col-span-2">
            <span className="field-label">Descrição</span>
            <textarea
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Pontos de parada, observações do itinerário…"
              className="field resize-none"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

/** Sugere o próximo código sequencial (R01, R02, …). */
function proximoCodigo(rotas: Rota[]): string {
  const numeros = rotas
    .map((r) => Number(r.codigo.replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n))
  const proximo = (numeros.length ? Math.max(...numeros) : 0) + 1
  return `R${String(proximo).padStart(2, '0')}`
}
