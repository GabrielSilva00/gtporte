import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../lib/supabase'
import { useUniversidades } from '../hooks/useCadastros'
import { Modal } from '../components/ui/Modal'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeMais } from '../components/icons'

interface Parada {
  id: string
  rota_id: string
  ordem: number
  nome: string
  endereco: string | null
  latitude: number | null
  longitude: number | null
  universidade_id: string | null
  minutos_partida: number | null
  ativo: boolean
}

interface Rota {
  id: string
  codigo: string
  nome: string
}

const VAZIO = {
  nome: '',
  endereco: '',
  latitude: '',
  longitude: '',
  universidade_id: '',
  minutos_partida: '',
}

/**
 * Pontos de parada da rota (migration 0023).
 *
 * O trajeto não existia no sistema: havia apenas a posição crua do
 * veículo em localizacao_rota. Sem as paradas, o mapa do aplicativo do
 * estudante não tem o que desenhar além do ponto do ônibus, e o aluno
 * não sabe onde embarcar.
 */
export default function Paradas() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: universidades } = useUniversidades()
  const [rotaId, setRotaId] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Parada | null>(null)
  const [form, setForm] = useState(VAZIO)

  const { data: rotas } = useQuery({
    queryKey: ['rotas-paradas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota')
        .select('id,codigo,nome')
        .neq('status', 'inativa')
        .order('codigo')
      if (error) throw error
      return data as Rota[]
    },
  })

  // Primeira rota assim que a lista chega, para a tela não abrir vazia.
  useEffect(() => {
    if (!rotaId && rotas && rotas.length > 0) setRotaId(rotas[0].id)
  }, [rotas, rotaId])

  const { data: paradas, isLoading, error } = useQuery({
    queryKey: ['paradas', rotaId],
    enabled: !!rotaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parada_rota')
        .select('*')
        .eq('rota_id', rotaId)
        .order('ordem')
      if (error) throw error
      return data as Parada[]
    },
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        rota_id: rotaId,
        nome: form.nome.trim(),
        endereco: form.endereco.trim() || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        universidade_id: form.universidade_id || null,
        minutos_partida: form.minutos_partida ? Number(form.minutos_partida) : null,
      }
      if (editando) {
        const { error } = await supabase.from('parada_rota').update(payload).eq('id', editando.id)
        if (error) throw error
      } else {
        // A ordem segue a sequência atual; reordenar é feito pelas setas.
        const proxima = (paradas?.length ?? 0) + 1
        const { error } = await supabase
          .from('parada_rota')
          .insert({ ...payload, ordem: proxima })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paradas', rotaId] })
      toast.sucesso(editando ? 'Parada atualizada.' : 'Parada adicionada.')
      setModal(false)
      setEditando(null)
      setForm(VAZIO)
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parada_rota').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paradas', rotaId] })
      toast.sucesso('Parada removida.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  /** Troca a ordem com a parada vizinha. */
  const mover = useMutation({
    mutationFn: async ({ id, direcao }: { id: string; direcao: -1 | 1 }) => {
      if (!paradas) return
      const i = paradas.findIndex((p) => p.id === id)
      const j = i + direcao
      if (i < 0 || j < 0 || j >= paradas.length) return
      const a = paradas[i]
      const b = paradas[j]
      // Passo pelo valor negativo evita colidir com o unique (rota_id, ordem).
      await supabase.from('parada_rota').update({ ordem: -1 }).eq('id', a.id)
      await supabase.from('parada_rota').update({ ordem: a.ordem }).eq('id', b.id)
      const { error } = await supabase.from('parada_rota').update({ ordem: b.ordem }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paradas', rotaId] }),
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const abrirNovo = () => {
    setEditando(null)
    setForm(VAZIO)
    setModal(true)
  }

  const abrirEdicao = (p: Parada) => {
    setEditando(p)
    setForm({
      nome: p.nome,
      endereco: p.endereco ?? '',
      latitude: p.latitude?.toString() ?? '',
      longitude: p.longitude?.toString() ?? '',
      universidade_id: p.universidade_id ?? '',
      minutos_partida: p.minutos_partida?.toString() ?? '',
    })
    setModal(true)
  }

  const semCoordenada = (paradas ?? []).filter((p) => p.latitude === null || p.longitude === null)
  const valido = form.nome.trim().length > 1

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Operação</div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Pontos de parada</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Onde o ônibus para ao longo do trajeto. É o que o estudante vê no mapa do aplicativo.
          </p>
        </div>
        <button onClick={abrirNovo} disabled={!rotaId} className="btn-primary shrink-0 px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <IconeMais size={15} />
            Nova parada
          </span>
        </button>
      </div>

      <label className="mt-5 block max-w-md">
        <span className="field-label">Rota</span>
        <select className="field" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
          {rotas?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo} — {r.nome}
            </option>
          ))}
        </select>
      </label>

      {semCoordenada.length > 0 && (
        <div className="mt-4 rounded-card border border-warn/30 bg-bg-warn px-4 py-3 text-[12.5px]">
          <b className="text-warn">
            {semCoordenada.length} parada(s) sem coordenada.
          </b>{' '}
          Paradas sem latitude e longitude aparecem na lista do aplicativo, mas não são desenhadas
          no mapa.
        </div>
      )}

      <div className="mt-5">
        {isLoading ? (
          <CarregandoCards />
        ) : error ? (
          <ErroCarregamento mensagem={mensagemErro(error)} />
        ) : !paradas || paradas.length === 0 ? (
          <Vazio
            titulo="Nenhuma parada cadastrada"
            descricao="Adicione os pontos em que o ônibus para, na ordem do trajeto."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {paradas.map((p, i) => (
              <div key={p.id} className="card flex items-center gap-3 p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[12px] text-primary-fg">
                  {p.ordem}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{p.nome}</div>
                  <div className="truncate text-[12px] text-muted">
                    {p.endereco || 'Sem endereço'}
                    {p.minutos_partida !== null && ` · ${p.minutos_partida} min da partida`}
                    {p.universidade_id &&
                      ` · ${universidades?.find((u) => u.id === p.universidade_id)?.nome ?? ''}`}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-soft">
                    {p.latitude !== null && p.longitude !== null
                      ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                      : 'sem coordenada'}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => mover.mutate({ id: p.id, direcao: -1 })}
                    disabled={i === 0 || mover.isPending}
                    className="btn-ghost px-2 py-1 text-[12px]"
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => mover.mutate({ id: p.id, direcao: 1 })}
                    disabled={i === paradas.length - 1 || mover.isPending}
                    className="btn-ghost px-2 py-1 text-[12px]"
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                  <button onClick={() => abrirEdicao(p)} className="btn-ghost px-3 py-1.5 text-[12px]">
                    Editar
                  </button>
                  <button
                    onClick={() => remover.mutate(p.id)}
                    disabled={remover.isPending}
                    className="btn-ghost px-3 py-1.5 text-[12px] text-danger"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        aberto={modal}
        titulo={editando ? 'Editar parada' : 'Nova parada'}
        onFechar={() => setModal(false)}
      >
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="field-label">Nome do ponto</span>
            <input
              className="field"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Praça Rui Barbosa"
            />
          </label>

          <label className="block">
            <span className="field-label">Endereço</span>
            <input
              className="field"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              placeholder="Rua, número, bairro"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Latitude</span>
              <input
                className="field font-mono"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="-21.2089"
              />
            </label>
            <label className="block">
              <span className="field-label">Longitude</span>
              <input
                className="field font-mono"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="-50.4328"
              />
            </label>
          </div>
          <p className="-mt-1 text-[11.5px] text-muted">
            Para obter as coordenadas: no Google Maps, clique com o botão direito sobre o ponto e
            copie os números que aparecem no topo do menu.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Universidade atendida</span>
              <select
                className="field"
                value={form.universidade_id}
                onChange={(e) => setForm({ ...form, universidade_id: e.target.value })}
              >
                <option value="">Nenhuma (ponto de embarque)</option>
                {universidades?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Minutos da partida</span>
              <input
                className="field"
                type="number"
                min={0}
                value={form.minutos_partida}
                onChange={(e) => setForm({ ...form, minutos_partida: e.target.value })}
                placeholder="15"
              />
            </label>
          </div>

          <button
            onClick={() => salvar.mutate()}
            disabled={!valido || salvar.isPending}
            className="btn-primary mt-1 w-full py-2.5"
          >
            {salvar.isPending ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar parada'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
