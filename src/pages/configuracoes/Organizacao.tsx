import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCidades, useOrganizacao, useUniversidades } from '../../hooks/useCadastros'
import {
  BUCKET_INSTITUCIONAL,
  caminhoLogotipo,
  mensagemErro,
  supabase,
} from '../../lib/supabase'
import { dataBR, diasParaVencer } from '../../lib/format'
import {
  BLOCOS_ORGANIZACAO,
  VENCIMENTOS_ORGANIZACAO,
  type BlocoOrganizacao,
} from '../../lib/organizacao'
import { Campo, GradeCampos } from '../../components/ui/Campo'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Tabs } from '../../components/ui/Tabs'
import { UploadFoto } from '../../components/ui/UploadFoto'
import { CarregandoCards, ErroCarregamento } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeAlerta, IconeInfo, IconeMais } from '../../components/icons'
import type { TurnoOrganizacao } from '../../lib/types'

type Valores = Record<string, unknown>

/**
 * Cadastro institucional em blocos (migration 0009).
 *
 * São ~70 campos, então a navegação é um índice lateral em vez de abas
 * horizontais, e cada bloco salva sozinho: um submit único para tudo
 * faria o usuário perder trabalho a cada erro de validação.
 */
export default function Organizacao({ somenteLeitura }: { somenteLeitura: boolean }) {
  const { data: organizacao, isLoading, error } = useOrganizacao()
  const { data: universidades } = useUniversidades()
  const { data: cidades } = useCidades()
  const qc = useQueryClient()
  const toast = useToast()

  const [blocoAtivo, setBlocoAtivo] = useState(BLOCOS_ORGANIZACAO[0].chave)
  const [valores, setValores] = useState<Valores>({})
  const [logo, setLogo] = useState<File | null>(null)
  const [uniSelecionadas, setUniSelecionadas] = useState<Set<string>>(new Set())
  const [cidadesSelecionadas, setCidadesSelecionadas] = useState<Set<string>>(new Set())

  /**
   * Mescla em vez de substituir. Salvar um bloco invalida a query, e
   * sobrescrever o estado inteiro apagaria em silêncio o que o usuário
   * digitou em outros blocos e ainda não salvou — com ~70 campos, digitar
   * em mais de um bloco antes de salvar é o caso comum, não a exceção.
   */
  useEffect(() => {
    if (!organizacao) return
    const doServidor = organizacao as unknown as Valores
    setValores((atual) => {
      const mesclado: Valores = { ...doServidor }
      for (const [chave, valor] of Object.entries(atual)) {
        if (valor !== doServidor[chave]) mesclado[chave] = valor
      }
      return mesclado
    })
  }, [organizacao])

  // Vínculos com instituições e municípios — tabelas filhas de 0009
  const { data: vinculos } = useQuery({
    queryKey: ['organizacao-vinculos', organizacao?.id],
    enabled: !!organizacao?.id,
    queryFn: async () => {
      const [uni, abr] = await Promise.all([
        supabase
          .from('organizacao_universidade')
          .select('universidade_id')
          .eq('organizacao_id', organizacao!.id),
        supabase
          .from('organizacao_abrangencia')
          .select('cidade_id')
          .eq('organizacao_id', organizacao!.id),
      ])
      if (uni.error) throw uni.error
      if (abr.error) throw abr.error
      return {
        universidades: uni.data.map((u) => u.universidade_id as string),
        cidades: abr.data.map((c) => c.cidade_id as string),
      }
    },
  })

  useEffect(() => {
    setUniSelecionadas(new Set(vinculos?.universidades ?? []))
    setCidadesSelecionadas(new Set(vinculos?.cidades ?? []))
  }, [vinculos])

  const bloco = BLOCOS_ORGANIZACAO.find((b) => b.chave === blocoAtivo) ?? BLOCOS_ORGANIZACAO[0]

  /** Quantos campos do bloco já estão preenchidos — alimenta o indicador. */
  function preenchimento(b: BlocoOrganizacao) {
    if (b.campos.length === 0) return { feitos: 0, total: 0 }
    const feitos = b.campos.filter((c) => {
      const v = valores[c.chave]
      return c.tipo === 'booleano' ? v === true : v !== null && v !== undefined && v !== ''
    }).length
    return { feitos, total: b.campos.length }
  }

  const salvarBloco = useMutation({
    mutationFn: async (b: BlocoOrganizacao) => {
      if (!organizacao) throw new Error('Cadastro institucional não encontrado.')

      // PATCH parcial: só as chaves do bloco em edição vão para o banco.
      const patch: Valores = {}
      for (const c of b.campos) patch[c.chave] = valores[c.chave] ?? null

      if (b.especial === 'turnos') patch.turnos = valores.turnos ?? []

      if (b.especial === 'identidade' && logo) {
        const caminho = caminhoLogotipo(logo)
        const { error: erroUpload } = await supabase.storage
          .from(BUCKET_INSTITUCIONAL)
          .upload(caminho, logo, { upsert: true })
        if (erroUpload) throw erroUpload
        patch.logo_path = caminho
      }
      if (b.especial === 'identidade') {
        patch.cor_primaria = valores.cor_primaria ?? null
        patch.cor_secundaria = valores.cor_secundaria ?? null
      }

      if (Object.keys(patch).length > 0) {
        const { error: err } = await supabase
          .from('organizacao')
          .update(patch)
          .eq('id', organizacao.id)
        if (err) throw err
      }

      if (b.especial === 'universidades') {
        await sincronizarVinculo(
          'organizacao_universidade',
          'universidade_id',
          organizacao.id,
          new Set(vinculos?.universidades ?? []),
          uniSelecionadas,
        )
      }

      if (b.especial === 'abrangencia') {
        await sincronizarVinculo(
          'organizacao_abrangencia',
          'cidade_id',
          organizacao.id,
          new Set(vinculos?.cidades ?? []),
          cidadesSelecionadas,
        )
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizacao'] })
      qc.invalidateQueries({ queryKey: ['organizacao-vinculos'] })
      setLogo(null)
      toast.sucesso('Bloco salvo.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  /** Aplica só a diferença, para não apagar tudo e reinserir. */
  async function sincronizarVinculo(
    tabela: string,
    coluna: string,
    organizacaoId: string,
    antes: Set<string>,
    depois: Set<string>,
  ) {
    const incluir = [...depois].filter((id) => !antes.has(id))
    const remover = [...antes].filter((id) => !depois.has(id))

    if (incluir.length > 0) {
      const { error: err } = await supabase
        .from(tabela)
        .insert(incluir.map((id) => ({ organizacao_id: organizacaoId, [coluna]: id })))
      if (err) throw err
    }
    if (remover.length > 0) {
      const { error: err } = await supabase
        .from(tabela)
        .delete()
        .eq('organizacao_id', organizacaoId)
        .in(coluna, remover)
      if (err) throw err
    }
  }

  const logoUrl = useMemo(() => {
    if (!organizacao?.logo_path) return null
    const { data } = supabase.storage
      .from(BUCKET_INSTITUCIONAL)
      .getPublicUrl(organizacao.logo_path)
    return data.publicUrl
  }, [organizacao?.logo_path])

  const vencendo = useMemo(() => {
    return VENCIMENTOS_ORGANIZACAO.map((v) => ({
      ...v,
      data: (valores[v.chave] as string | null) ?? null,
      dias: diasParaVencer((valores[v.chave] as string | null) ?? null),
    })).filter((v) => v.dias !== null && v.dias <= 60)
  }, [valores])

  function mudar(chave: string, valor: unknown) {
    setValores((atual) => ({ ...atual, [chave]: valor }))
  }

  if (isLoading) return <CarregandoCards itens={2} altura={200} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (!organizacao) {
    return (
      <div className="card flex items-start gap-2.5 p-5 text-[12.5px] text-muted">
        <span className="mt-px shrink-0 text-primary">
          <IconeInfo size={15} />
        </span>
        O cadastro institucional ainda não existe no banco. Aplique a migration
        <b className="mx-1">0009_organizacao.sql</b> no Supabase para criá-lo.
      </div>
    )
  }

  const { feitos, total } = preenchimento(bloco)

  return (
    <div>
      {vencendo.length > 0 && (
        <div className="card mb-3.5 border-warn/40 bg-bg-warn p-4">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-fg-warn">
            <IconeAlerta size={15} />
            Vigências a vencer
          </div>
          <ul className="flex flex-col gap-1 text-[12px] text-fg-warn">
            {vencendo.map((v) => (
              <li key={v.chave}>
                <b>{v.rotulo}</b>{' '}
                {v.dias! < 0
                  ? `venceu em ${dataBR(v.data)}`
                  : `vence em ${dataBR(v.data)}, faltam ${v.dias} dia(s)`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[240px_1fr]">
        {/* Índice lateral — 13 blocos não cabem em abas horizontais */}
        <aside className="card h-fit p-2 lg:sticky lg:top-4">
          <div className="hidden lg:block">
            <Tabs
              orientacao="vertical"
              abas={BLOCOS_ORGANIZACAO.map((b) => {
                const p = preenchimento(b)
                return {
                  chave: b.chave,
                  rotulo: b.rotulo,
                  contador: p.total > 0 ? p.feitos : undefined,
                }
              })}
              ativa={blocoAtivo}
              onMudar={setBlocoAtivo}
            />
          </div>
          <div className="lg:hidden">
            <Tabs
              variante="pilulas"
              abas={BLOCOS_ORGANIZACAO.map((b) => ({ chave: b.chave, rotulo: b.rotulo }))}
              ativa={blocoAtivo}
              onMudar={setBlocoAtivo}
            />
          </div>
        </aside>

        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{bloco.rotulo}</div>
              <p className="mt-1 max-w-[60ch] text-[12px] leading-relaxed text-muted">
                {bloco.ajuda}
              </p>
            </div>
            {total > 0 && (
              <div className="w-[130px] shrink-0">
                <div className="mb-1 text-right text-[11px] text-muted">
                  {feitos} de {total} campos
                </div>
                <ProgressBar percentual={(feitos / total) * 100} altura={4} />
              </div>
            )}
          </div>

          <GradeCampos>
            {bloco.campos.map((c) => (
              <Campo
                key={c.chave}
                campo={c}
                valor={valores[c.chave]}
                onMudar={mudar}
                somenteLeitura={somenteLeitura}
              />
            ))}
          </GradeCampos>

          {bloco.chave === 'contato' && (
            <div className="mt-3.5">
              <label className="block max-w-[280px]">
                <span className="field-label">Cidade da sede</span>
                <select
                  value={(valores.cidade_id as string) ?? ''}
                  disabled={somenteLeitura}
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
            </div>
          )}

          {bloco.especial === 'universidades' && (
            <SelecaoMultipla
              titulo="Instituições atendidas"
              vazio="Nenhuma universidade cadastrada ainda."
              itens={(universidades ?? []).map((u) => ({
                id: u.id,
                rotulo: u.nome,
                detalhe: u.cidade?.nome ?? null,
                cor: u.cor,
              }))}
              selecionados={uniSelecionadas}
              somenteLeitura={somenteLeitura}
              onAlternar={(id) => setUniSelecionadas(alternar(uniSelecionadas, id))}
            />
          )}

          {bloco.especial === 'abrangencia' && (
            <SelecaoMultipla
              titulo="Municípios cobertos"
              vazio="Nenhuma cidade cadastrada ainda."
              itens={(cidades ?? []).map((c) => ({
                id: c.id,
                rotulo: c.nome,
                detalhe: c.uf,
                cor: null,
              }))}
              selecionados={cidadesSelecionadas}
              somenteLeitura={somenteLeitura}
              onAlternar={(id) => setCidadesSelecionadas(alternar(cidadesSelecionadas, id))}
            />
          )}

          {bloco.especial === 'turnos' && (
            <ListaTurnos
              turnos={(valores.turnos as TurnoOrganizacao[]) ?? []}
              somenteLeitura={somenteLeitura}
              onMudar={(t) => mudar('turnos', t)}
            />
          )}

          {bloco.especial === 'identidade' && (
            <div className="flex flex-col gap-4">
              <UploadFoto
                nome={(valores.nome_fantasia as string) ?? 'GTPORTE'}
                url={logoUrl}
                arquivo={logo}
                tamanho={96}
                circular={false}
                desabilitado={somenteLeitura}
                onSelecionar={setLogo}
                rotulo="Logotipo"
                ajuda="Usado em relatórios, comunicados e carteirinhas. PNG com fundo transparente."
              />
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <CampoCor
                  rotulo="Cor primária"
                  valor={(valores.cor_primaria as string) ?? '#1F3A2E'}
                  somenteLeitura={somenteLeitura}
                  onMudar={(v) => mudar('cor_primaria', v)}
                />
                <CampoCor
                  rotulo="Cor secundária"
                  valor={(valores.cor_secundaria as string) ?? '#C4633A'}
                  somenteLeitura={somenteLeitura}
                  onMudar={(v) => mudar('cor_secundaria', v)}
                />
              </div>
            </div>
          )}

          {!somenteLeitura && (
            <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
              <button
                onClick={() => salvarBloco.mutate(bloco)}
                disabled={salvarBloco.isPending}
                className="btn-primary"
              >
                {salvarBloco.isPending ? 'Salvando…' : 'Salvar bloco'}
              </button>
              <span className="text-[11.5px] text-muted">
                Cada bloco é salvo separadamente — os demais não são afetados.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function alternar(atual: Set<string>, id: string) {
  const proximo = new Set(atual)
  if (proximo.has(id)) proximo.delete(id)
  else proximo.add(id)
  return proximo
}

function CampoCor({
  rotulo,
  valor,
  somenteLeitura,
  onMudar,
}: {
  rotulo: string
  valor: string
  somenteLeitura: boolean
  onMudar: (v: string) => void
}) {
  return (
    <label>
      <span className="field-label">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valor}
          disabled={somenteLeitura}
          onChange={(e) => onMudar(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-field border border-edge bg-surface p-1"
        />
        <input
          value={valor}
          disabled={somenteLeitura}
          onChange={(e) => onMudar(e.target.value)}
          className="field font-mono"
        />
      </div>
    </label>
  )
}

interface ItemSelecao {
  id: string
  rotulo: string
  detalhe: string | null
  cor: string | null
}

function SelecaoMultipla({
  titulo,
  vazio,
  itens,
  selecionados,
  somenteLeitura,
  onAlternar,
}: {
  titulo: string
  vazio: string
  itens: ItemSelecao[]
  selecionados: Set<string>
  somenteLeitura: boolean
  onAlternar: (id: string) => void
}) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="field-label mb-0">{titulo}</span>
        <span className="text-[11.5px] text-muted">{selecionados.size} selecionado(s)</span>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-field bg-tint px-3.5 py-3 text-[12px] text-muted">{vazio}</div>
      ) : (
        <div className="grid max-h-[280px] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {itens.map((i) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1.5 text-[12.5px] hover:bg-tint"
            >
              <input
                type="checkbox"
                checked={selecionados.has(i.id)}
                disabled={somenteLeitura}
                onChange={() => onAlternar(i.id)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {i.cor && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: i.cor }}
                />
              )}
              <span className="truncate">{i.rotulo}</span>
              {i.detalhe && <span className="ml-auto text-[11px] text-soft">{i.detalhe}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Turnos atendidos — lista livre, guardada em jsonb por ser o dado mais volátil. */
function ListaTurnos({
  turnos,
  somenteLeitura,
  onMudar,
}: {
  turnos: TurnoOrganizacao[]
  somenteLeitura: boolean
  onMudar: (t: TurnoOrganizacao[]) => void
}) {
  function atualizar(i: number, campo: keyof TurnoOrganizacao, valor: string) {
    onMudar(turnos.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t)))
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 field-label">Turnos atendidos</div>

      <div className="flex flex-col gap-2">
        {turnos.map((t, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label>
              <span className="field-label">Turno</span>
              <input
                value={t.nome}
                disabled={somenteLeitura}
                onChange={(e) => atualizar(i, 'nome', e.target.value)}
                placeholder="Manhã, tarde, noite, integral"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Entrada</span>
              <input
                type="time"
                value={t.entrada}
                disabled={somenteLeitura}
                onChange={(e) => atualizar(i, 'entrada', e.target.value)}
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Saída</span>
              <input
                type="time"
                value={t.saida}
                disabled={somenteLeitura}
                onChange={(e) => atualizar(i, 'saida', e.target.value)}
                className="field"
              />
            </label>
            {!somenteLeitura && (
              <button
                onClick={() => onMudar(turnos.filter((_, idx) => idx !== i))}
                className="btn-ghost mb-px px-3 py-2.5 text-[12px] text-danger"
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>

      {!somenteLeitura && (
        <button
          onClick={() => onMudar([...turnos, { nome: '', entrada: '', saida: '' }])}
          className="btn-ghost mt-3"
        >
          <IconeMais size={13} />
          Adicionar turno
        </button>
      )}

      {turnos.length === 0 && (
        <div className="mt-3 rounded-field bg-tint px-3.5 py-3 text-[12px] text-muted">
          Nenhum turno cadastrado. Os horários de entrada e saída das escolas alimentam o
          planejamento das rotas.
        </div>
      )}
    </div>
  )
}
