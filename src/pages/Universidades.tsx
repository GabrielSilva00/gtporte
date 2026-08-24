import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCidades, useUniversidades } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import { CarregandoCards, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeMais, IconeUniversidade } from '../components/icons'
import type { Cidade, Universidade } from '../lib/types'

const CORES = [
  '#1F3A2E', '#2E7D5A', '#4A8F6B', '#1F5C7A',
  '#2B6CB0', '#3F51A8', '#6B4FA8', '#8A3E8C',
  '#9E3E3E', '#C4633A', '#B8862B', '#8A5A15',
  '#6B7570', '#455A5F', '#7A5C3E', '#3D3D5C',
]

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
  const [formUni, setFormUni] = useState({
    nome: '',
    cidade_id: '',
    cor: CORES[0],
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
  })
  const [formCidade, setFormCidade] = useState({ nome: '', uf: 'SP' })

  // Contadores reais por universidade (substituem os números fixos do protótipo).
  // O vínculo rota→universidade vive em rota_universidade desde 0006_ajustes.sql;
  // rota sem nenhum vínculo atende todas as instituições (rota_atende_universidade()).
  const { data: contadores } = useQuery({
    queryKey: ['contadores-universidade'],
    queryFn: async () => {
      const [estudantes, rotas, vinculos] = await Promise.all([
        supabase.from('estudante').select('universidade_id').eq('ativo', true),
        supabase.from('rota').select('id').neq('status', 'inativa'),
        supabase.from('rota_universidade').select('rota_id, universidade_id'),
      ])
      if (estudantes.error) throw estudantes.error
      if (rotas.error) throw rotas.error
      if (vinculos.error) throw vinculos.error

      const rotasAtivas = new Set(rotas.data.map((r) => r.id))
      const comVinculo = new Set(vinculos.data.map((v) => v.rota_id))
      // Rotas ativas sem nenhuma universidade marcada valem para todas
      const irrestritas = [...rotasAtivas].filter((id) => !comVinculo.has(id)).length

      const porUni = new Map<string, { estudantes: number; rotas: number }>()
      const garantir = (id: string | null) => {
        if (!id) return null
        if (!porUni.has(id)) porUni.set(id, { estudantes: 0, rotas: irrestritas })
        return porUni.get(id)!
      }

      estudantes.data.forEach((e) => {
        const alvo = garantir(e.universidade_id)
        if (alvo) alvo.estudantes++
      })
      vinculos.data.forEach((v) => {
        if (!rotasAtivas.has(v.rota_id)) return
        const alvo = garantir(v.universidade_id)
        if (alvo) alvo.rotas++
      })

      return { porUni, irrestritas }
    },
  })

  const salvarUni = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: formUni.nome.trim(),
        cidade_id: formUni.cidade_id,
        cor: formUni.cor,
        logradouro: formUni.logradouro.trim() || null,
        numero: formUni.numero.trim() || null,
        complemento: formUni.complemento.trim() || null,
        bairro: formUni.bairro.trim() || null,
        cep: formUni.cep.trim() || null,
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
    setFormUni({
      nome: '',
      cidade_id: cidades?.[0]?.id ?? '',
      cor: CORES[0],
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cep: '',
    })
    setModalUni(true)
  }

  function abrirEdicaoUni(u: Universidade) {
    setEditandoUni(u)
    setFormUni({
      nome: u.nome,
      cidade_id: u.cidade_id,
      cor: u.cor,
      logradouro: u.logradouro ?? '',
      numero: u.numero ?? '',
      complemento: u.complemento ?? '',
      bairro: u.bairro ?? '',
      cep: u.cep ?? '',
    })
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
              {!!contadores?.irrestritas && (
                <>
                  {' · '}
                  {contadores.irrestritas} rota(s) sem restrição contam para todas
                </>
              )}
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
              const c = contadores?.porUni.get(u.id)
              const rotas = c?.rotas ?? contadores?.irrestritas ?? 0
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
                      <div className="font-mono text-[16px] font-semibold">{rotas}</div>
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

        <div className="card max-h-[460px] divide-y divide-line overflow-y-auto">
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
        descricao="O endereço do campus alimenta o planejamento de itinerários."
        largura={720}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 sm:col-span-3">
              <span className="field-label">Logradouro</span>
              <input
                value={formUni.logradouro}
                onChange={(e) => setFormUni({ ...formUni, logradouro: e.target.value })}
                placeholder="Rua Marechal Rondon"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Número</span>
              <input
                value={formUni.numero}
                onChange={(e) => setFormUni({ ...formUni, numero: e.target.value })}
                placeholder="2100"
                className="field"
              />
            </label>
            <label className="col-span-2">
              <span className="field-label">Bairro</span>
              <input
                value={formUni.bairro}
                onChange={(e) => setFormUni({ ...formUni, bairro: e.target.value })}
                placeholder="Centro"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Complemento</span>
              <input
                value={formUni.complemento}
                onChange={(e) => setFormUni({ ...formUni, complemento: e.target.value })}
                placeholder="Bloco A"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">CEP</span>
              <input
                value={formUni.cep}
                onChange={(e) =>
                  setFormUni({
                    ...formUni,
                    cep: e.target.value.replace(/D/g, '').slice(0, 8).replace(/^(d{5})(d)/, '$1-$2'),
                  })
                }
                placeholder="16050-000"
                className="field font-mono"
              />
            </label>
          </div>

          <div>
            <span className="field-label">Cor de identificação</span>
            <div className="grid grid-cols-8 gap-2">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setFormUni({ ...formUni, cor })}
                  className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-white transition-transform ${
                    formUni.cor === cor ? 'scale-110 ring-2 ring-ink/25 ring-offset-2' : ''
                  }`}
                  style={{ background: cor }}
                  aria-label={`Cor ${cor}`}
                  aria-pressed={formUni.cor === cor}
                >
                  {formUni.cor === cor && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
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
