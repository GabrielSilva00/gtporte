import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCidades, useUniversidades } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeMais, IconeUniversidade } from '../components/icons'
import type { Cidade, Universidade } from '../lib/types'

const CORES = ['#1F3A2E', '#8A5A15', '#C4633A', '#2E7D5A', '#9E3E3E', '#6B7570']

/** RF06 (universidades) + RF07 (cidades de origem e destino). */
export default function Universidades() {
  const { data: universidades, isLoading, error } = useUniversidades()
  const { data: cidades } = useCidades()
  const qc = useQueryClient()
  const toast = useToast()

  const [modalUni, setModalUni] = useState(false)
  const [modalCidade, setModalCidade] = useState(false)
  const [editandoUni, setEditandoUni] = useState<Universidade | null>(null)
  const [editandoCidade, setEditandoCidade] = useState<Cidade | null>(null)
  const [formUni, setFormUni] = useState({ nome: '', cidade_id: '', cor: CORES[0] })
  const [formCidade, setFormCidade] = useState({ nome: '', uf: 'SP' })

  // Contadores reais por universidade (substituem os números fixos do protótipo)
  const { data: contadores } = useQuery({
    queryKey: ['contadores-universidade'],
    queryFn: async () => {
      const [estudantes, rotas] = await Promise.all([
        supabase.from('estudante').select('universidade_id').eq('ativo', true),
        supabase.from('rota').select('universidade_id').neq('status', 'inativa'),
      ])
      if (estudantes.error) throw estudantes.error
      if (rotas.error) throw rotas.error

      const porUni = new Map<string, { estudantes: number; rotas: number }>()
      const garantir = (id: string | null) => {
        if (!id) return null
        if (!porUni.has(id)) porUni.set(id, { estudantes: 0, rotas: 0 })
        return porUni.get(id)!
      }
      estudantes.data.forEach((e) => {
        const alvo = garantir(e.universidade_id)
        if (alvo) alvo.estudantes++
      })
      rotas.data.forEach((r) => {
        const alvo = garantir(r.universidade_id)
        if (alvo) alvo.rotas++
      })
      return porUni
    },
  })

  const salvarUni = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: formUni.nome.trim(),
        cidade_id: formUni.cidade_id,
        cor: formUni.cor,
      }
      const resposta = editandoUni
        ? await supabase.from('universidade').update(payload).eq('id', editandoUni.id)
        : await supabase.from('universidade').insert(payload)
      if (resposta.error) throw resposta.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['universidades'] })
      toast.sucesso(editandoUni ? 'Universidade atualizada.' : 'Universidade cadastrada.')
      setModalUni(false)
      setEditandoUni(null)
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const salvarCidade = useMutation({
    mutationFn: async () => {
      const payload = { nome: formCidade.nome.trim(), uf: formCidade.uf.toUpperCase() }
      const resposta = editandoCidade
        ? await supabase.from('cidade').update(payload).eq('id', editandoCidade.id)
        : await supabase.from('cidade').insert(payload)
      if (resposta.error) throw resposta.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cidades'] })
      toast.sucesso(editandoCidade ? 'Cidade atualizada.' : 'Cidade cadastrada.')
      setModalCidade(false)
      setEditandoCidade(null)
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirNovaUni() {
    setEditandoUni(null)
    setFormUni({ nome: '', cidade_id: cidades?.[0]?.id ?? '', cor: CORES[0] })
    setModalUni(true)
  }

  function abrirEdicaoUni(u: Universidade) {
    setEditandoUni(u)
    setFormUni({ nome: u.nome, cidade_id: u.cidade_id, cor: u.cor })
    setModalUni(true)
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-semibold">Universidades</h1>
            <div className="mt-1 text-[13px] text-muted">
              Instituições atendidas pelo transporte
            </div>
          </div>
          <button onClick={abrirNovaUni} className="btn-primary">
            <IconeMais size={14} />
            Nova
          </button>
        </div>

        {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
        {isLoading && <CarregandoCards itens={6} altura={168} />}

        {universidades && universidades.length === 0 && (
          <Vazio
            titulo="Nenhuma universidade cadastrada"
            descricao="O estudante precisa estar vinculado a uma instituição válida."
          />
        )}

        {universidades && universidades.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {universidades.map((u) => {
              const c = contadores?.get(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => abrirEdicaoUni(u)}
                  className="card p-[18px] text-left transition-colors hover:border-primary/30"
                >
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-[10px] text-white"
                    style={{ background: u.cor }}
                  >
                    <IconeUniversidade size={22} strokeWidth={1.6} />
                  </div>
                  <div className="mt-3 text-[14.5px] font-semibold">{u.nome}</div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {u.cidade?.nome ?? '-'}, {u.cidade?.uf ?? ''}
                  </div>
                  <div className="mt-3 flex gap-[18px] border-t border-line pt-3">
                    <div>
                      <div className="font-mono text-[16px] font-semibold">{c?.estudantes ?? 0}</div>
                      <div className="text-[10.5px] text-soft">estudantes</div>
                    </div>
                    <div>
                      <div className="font-mono text-[16px] font-semibold">{c?.rotas ?? 0}</div>
                      <div className="text-[10.5px] text-soft">rotas</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Painel lateral: cidades (RF07) */}
      <aside>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Cidades</h2>
            <div className="mt-1 text-[12px] text-muted">Origens e destinos</div>
          </div>
          <button
            onClick={() => {
              setEditandoCidade(null)
              setFormCidade({ nome: '', uf: 'SP' })
              setModalCidade(true)
            }}
            className="btn-ghost px-3 py-1.5 text-[12px]"
          >
            <IconeMais size={12} />
            Nova
          </button>
        </div>

        <div className="card divide-y divide-line">
          {(cidades ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setEditandoCidade(c)
                setFormCidade({ nome: c.nome, uf: c.uf })
                setModalCidade(true)
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-bg"
            >
              <span>{c.nome}</span>
              <span className="font-mono text-[11.5px] text-soft">{c.uf}</span>
            </button>
          ))}
          {cidades?.length === 0 && (
            <div className="px-4 py-8 text-center text-[12.5px] text-muted">
              Nenhuma cidade cadastrada
            </div>
          )}
        </div>
      </aside>

      <Modal
        aberto={modalUni}
        titulo={editandoUni ? `Editar ${editandoUni.nome}` : 'Nova universidade'}
        onFechar={() => setModalUni(false)}
        rodape={
          <>
            <button onClick={() => setModalUni(false)} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvarUni.mutate()}
              disabled={!formUni.nome.trim() || !formUni.cidade_id || salvarUni.isPending}
              className="btn-primary"
            >
              {salvarUni.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label>
            <span className="field-label">Nome da instituição</span>
            <input
              value={formUni.nome}
              onChange={(e) => setFormUni({ ...formUni, nome: e.target.value })}
              placeholder="UNESP Araçatuba"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Cidade</span>
            <select
              value={formUni.cidade_id}
              onChange={(e) => setFormUni({ ...formUni, cidade_id: e.target.value })}
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
          <div>
            <span className="field-label">Cor de identificação</span>
            <div className="flex gap-2">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  onClick={() => setFormUni({ ...formUni, cor })}
                  className={`h-9 w-9 rounded-[10px] transition-transform ${
                    formUni.cor === cor ? 'scale-110 ring-2 ring-ink/20 ring-offset-2' : ''
                  }`}
                  style={{ background: cor }}
                  aria-label={`Cor ${cor}`}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={modalCidade}
        titulo={editandoCidade ? `Editar ${editandoCidade.nome}` : 'Nova cidade'}
        largura={440}
        onFechar={() => setModalCidade(false)}
        rodape={
          <>
            <button onClick={() => setModalCidade(false)} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvarCidade.mutate()}
              disabled={!formCidade.nome.trim() || salvarCidade.isPending}
              className="btn-primary"
            >
              {salvarCidade.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <label>
            <span className="field-label">Nome</span>
            <input
              value={formCidade.nome}
              onChange={(e) => setFormCidade({ ...formCidade, nome: e.target.value })}
              placeholder="Birigui"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">UF</span>
            <input
              value={formCidade.uf}
              onChange={(e) => setFormCidade({ ...formCidade, uf: e.target.value.toUpperCase() })}
              maxLength={2}
              className="field font-mono uppercase"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
