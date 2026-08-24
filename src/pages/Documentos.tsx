import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BUCKET_DOCUMENTOS, mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeArquivo, IconeInfo } from '../components/icons'
import {
  ROTULO_DOCUMENTO,
  SIGLA_DOCUMENTO,
  type Documento,
  type Estudante,
  type StatusDocumental,
  type TipoDocumento,
} from '../lib/types'

type Aba = StatusDocumental

const CORES_SIGLA: Record<StatusDocumental, { bg: string; fg: string }> = {
  aprovado: { bg: '#EAF3EC', fg: '#2E7D5A' },
  pendente: { bg: '#FBEEDA', fg: '#8A5A15' },
  rejeitado: { bg: '#FBECEC', fg: '#9E3E3E' },
}

interface EstudanteComDocs extends Estudante {
  documentos: Documento[]
  ultimoEnvio: string
}

/** RF03 — análise documental. RN07: aprovar/rejeitar é exclusivo de admin. */
export default function Documentos() {
  const { ehAdmin } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [aba, setAba] = useState<Aba>('pendente')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [modalRejeicao, setModalRejeicao] = useState<{ doc?: Documento; todos?: boolean } | null>(null)
  const [observacao, setObservacao] = useState('')

  const { data: fila, isLoading, error } = useQuery({
    queryKey: ['fila-documentos'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('estudante')
        .select(
          '*, universidade:universidade_id (id, nome, cor), cidade:cidade_id (id, nome), documento (*)',
        )
        .order('nome')
      if (err) throw err

      return (data as unknown as (Estudante & { documento: Documento[] })[])
        .filter((e) => e.documento.length > 0)
        .map<EstudanteComDocs>((e) => ({
          ...e,
          documentos: [...e.documento].sort(
            (a, b) => TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo),
          ),
          ultimoEnvio: e.documento.reduce(
            (max, d) => (d.criado_em > max ? d.criado_em : max),
            e.documento[0].criado_em,
          ),
        }))
    },
  })

  const contadores = useMemo(() => {
    const c: Record<Aba, number> = { pendente: 0, aprovado: 0, rejeitado: 0 }
    ;(fila ?? []).forEach((e) => c[e.status_documental]++)
    return c
  }, [fila])

  const listaAba = useMemo(
    () => (fila ?? []).filter((e) => e.status_documental === aba),
    [fila, aba],
  )

  const selecionado = useMemo(
    () => listaAba.find((e) => e.id === selecionadoId) ?? listaAba[0] ?? null,
    [listaAba, selecionadoId],
  )

  // Gera signed URLs para pré-visualizar os arquivos do bucket privado
  useEffect(() => {
    if (!selecionado) return
    let ativo = true
    ;(async () => {
      const entradas: Record<string, string> = {}
      for (const doc of selecionado.documentos) {
        const { data } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .createSignedUrl(doc.storage_path, 300)
        if (data?.signedUrl) entradas[doc.id] = data.signedUrl
      }
      if (ativo) setPreviews(entradas)
    })()
    return () => {
      ativo = false
    }
  }, [selecionado])

  function aoConcluir(mensagem: string) {
    qc.invalidateQueries({ queryKey: ['fila-documentos'] })
    qc.invalidateQueries({ queryKey: ['estudantes'] })
    qc.invalidateQueries({ queryKey: ['contadores-nav'] })
    qc.invalidateQueries({ queryKey: ['dashboard-totais'] })
    toast.sucesso(mensagem)
  }

  const aprovar = useMutation({
    mutationFn: async (documentoId: string) => {
      const { error: err } = await supabase.rpc('aprovar_documento', {
        p_documento_id: documentoId,
      })
      if (err) throw err
    },
    onSuccess: () => aoConcluir('Documento aprovado.'),
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const rejeitar = useMutation({
    mutationFn: async ({ documentoId, motivo }: { documentoId: string; motivo: string }) => {
      const { error: err } = await supabase.rpc('rejeitar_documento', {
        p_documento_id: documentoId,
        p_observacao: motivo,
      })
      if (err) throw err
    },
    onSuccess: () => {
      aoConcluir('Documento rejeitado.')
      setModalRejeicao(null)
      setObservacao('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const cancelarAprovacao = useMutation({
    mutationFn: async (documentoId: string) => {
      const { error: err } = await supabase.rpc('cancelar_aprovacao_documento', {
        p_documento_id: documentoId,
      })
      if (err) throw err
    },
    onSuccess: () => aoConcluir('Aprovação cancelada. O documento voltou para pendente.'),
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const revisarTudo = useMutation({
    mutationFn: async ({ status, motivo }: { status: StatusDocumental; motivo?: string }) => {
      if (!selecionado) return
      const { error: err } = await supabase.rpc('revisar_documentos_estudante', {
        p_estudante_id: selecionado.id,
        p_status: status,
        p_observacao: motivo ?? null,
      })
      if (err) throw err
    },
    onSuccess: (_d, v) => {
      aoConcluir(v.status === 'aprovado' ? 'Todos os documentos aprovados.' : 'Documentos rejeitados.')
      setModalRejeicao(null)
      setObservacao('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Validação de documentos</h1>
        <div className="mt-1 text-[13px] text-muted">
          Estudante só é alocado após aprovação documental.
        </div>
      </div>

      {!ehAdmin && (
        <div className="mb-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3 text-[12.5px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          apenas administradores podem aprovar ou rejeitar documentos. Você está em modo
          leitura.
        </div>
      )}

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoTabela />}

      {fila && fila.length === 0 && (
        <Vazio
          titulo="Nenhum documento enviado"
          descricao="Os envios aparecem aqui assim que um estudante submeter a documentação."
        />
      )}

      {fila && fila.length > 0 && (
        <div className="grid h-[calc(100vh-210px)] grid-cols-1 gap-3.5 lg:grid-cols-[320px_1fr]">
          {/* Fila */}
          <div className="card flex flex-col overflow-hidden">
            <div className="border-b border-edge px-3.5 py-3">
              <Tabs
                variante="pilulas"
                abas={(['pendente', 'aprovado', 'rejeitado'] as Aba[]).map((a) => ({
                  chave: a,
                  rotulo: ROTULO_ABA[a],
                  contador: contadores[a],
                }))}
                ativa={aba}
                onMudar={(a) => {
                  setAba(a)
                  setSelecionadoId(null)
                }}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {listaAba.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelecionadoId(e.id)}
                  className="block w-full border-b border-line px-3.5 py-3 text-left"
                  style={{
                    background: selecionado?.id === e.id ? '#FBF9F3' : 'transparent',
                    borderLeft: `3px solid ${selecionado?.id === e.id ? '#1F3A2E' : 'transparent'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{e.nome}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-soft">
                        {e.universidade?.nome}
                      </div>
                    </div>
                    <div className="whitespace-nowrap font-mono text-[10.5px] text-soft">
                      {new Date(e.ultimoEnvio).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {e.documentos.map((d) => {
                      const c = CORES_SIGLA[d.status]
                      return (
                        <span
                          key={d.id}
                          className="rounded-full px-1.5 py-0.5 font-mono text-3xs tracking-[0.04em]"
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {SIGLA_DOCUMENTO[d.tipo]}
                        </span>
                      )
                    })}
                  </div>
                </button>
              ))}

              {listaAba.length === 0 && (
                <div className="px-4 py-10 text-center text-[12.5px] text-muted">
                  Nenhum estudante nesta aba.
                </div>
              )}
            </div>
          </div>

          {/* Detalhe */}
          <div className="card flex flex-col overflow-hidden">
            {!selecionado && (
              <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
                Selecione um estudante na fila.
              </div>
            )}

            {selecionado && (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-edge px-5 py-4">
                  <div>
                    <div className="text-[17px] font-semibold">{selecionado.nome}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      Prontuário {selecionado.prontuario} · {selecionado.universidade?.nome}
                      {selecionado.curso ? ` · ${selecionado.curso}` : ''}
                    </div>
                  </div>
                  {ehAdmin && (
                    <div className="flex shrink-0 gap-2">
                      {selecionado.documentos.some((d) => d.status !== 'aprovado') && (
                        <button
                          onClick={() => setModalRejeicao({ todos: true })}
                          className="btn-danger px-3.5 py-2 text-[12.5px]"
                        >
                          Rejeitar tudo
                        </button>
                      )}
                      <button
                        onClick={() => revisarTudo.mutate({ status: 'aprovado' })}
                        disabled={revisarTudo.isPending}
                        className="btn-success px-3.5 py-2 text-[12.5px]"
                      >
                        Aprovar tudo
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {selecionado.documentos.map((d) => {
                      const c = CORES_SIGLA[d.status]
                      const url = previews[d.id]
                      return (
                        <div key={d.id} className="overflow-hidden rounded-[10px] border border-edge">
                          <div
                            className="relative flex aspect-[4/3] max-h-[136px] items-center justify-center"
                            style={{
                              backgroundColor: '#FCFAF4',
                              backgroundImage:
                                'repeating-linear-gradient(45deg, #F5F3EE 0 6px, transparent 6px 12px)',
                            }}
                          >
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex max-w-[90%] items-center gap-1.5 rounded-md border border-edge bg-white px-2 py-1.5 text-[10.5px] text-muted hover:border-primary/40"
                              >
                                <IconeArquivo size={12} />
                                <span className="truncate font-mono">{d.nome_arquivo}</span>
                              </a>
                            ) : (
                              <span className="rounded-md border border-edge bg-white px-2 py-1.5 text-[10.5px] text-soft">
                                arquivo indisponível
                              </span>
                            )}
                            <span
                              className="absolute right-2 top-2 rounded-full px-1.5 py-px text-[9.5px] uppercase"
                              style={{ background: c.bg, color: c.fg }}
                            >
                              {d.status}
                            </span>
                          </div>

                          <div className="px-3 py-2.5">
                            <div className="text-[12px] font-medium">{ROTULO_DOCUMENTO[d.tipo]}</div>
                            <div className="mt-0.5 text-[10.5px] text-soft">
                              Enviado {dataHoraBR(d.criado_em)}
                            </div>
                            {d.observacao && (
                              <div className="mt-1.5 rounded-md bg-bg-danger px-2 py-1 text-[10.5px] text-danger">
                                {d.observacao}
                              </div>
                            )}

                            {ehAdmin && (
                              <div className="mt-2 flex gap-1.5">
                                {d.status === 'aprovado' ? (
                                  <button
                                    onClick={() => cancelarAprovacao.mutate(d.id)}
                                    disabled={cancelarAprovacao.isPending}
                                    className="flex-1 rounded-md border border-edge py-1 text-[11px] text-muted hover:border-warn hover:text-warn"
                                  >
                                    Cancelar aprovação
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setModalRejeicao({ doc: d })}
                                      className="flex-1 rounded-md border border-danger py-1 text-[11px] text-danger hover:bg-bg-danger"
                                    >
                                      Rejeitar
                                    </button>
                                    <button
                                      onClick={() => aprovar.mutate(d.id)}
                                      disabled={aprovar.isPending}
                                      className="flex-1 rounded-md bg-success py-1 text-[11px] font-medium text-white hover:brightness-95"
                                    >
                                      Aprovar
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de observação obrigatória na rejeição */}
      <Modal
        aberto={modalRejeicao !== null}
        titulo={modalRejeicao?.todos ? 'Rejeitar todos os documentos' : 'Rejeitar documento'}
        descricao="Informe o motivo, ele fica visível para o estudante."
        largura={480}
        onFechar={() => {
          setModalRejeicao(null)
          setObservacao('')
        }}
        rodape={
          <>
            <button
              onClick={() => {
                setModalRejeicao(null)
                setObservacao('')
              }}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (modalRejeicao?.todos) {
                  revisarTudo.mutate({ status: 'rejeitado', motivo: observacao })
                } else if (modalRejeicao?.doc) {
                  rejeitar.mutate({ documentoId: modalRejeicao.doc.id, motivo: observacao })
                }
              }}
              disabled={!observacao.trim() || rejeitar.isPending || revisarTudo.isPending}
              className="btn-danger"
            >
              Confirmar rejeição
            </button>
          </>
        }
      >
        <label>
          <span className="field-label">Motivo da rejeição</span>
          <textarea
            rows={4}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: comprovante de residência ilegível; reenvie em melhor qualidade."
            className="field resize-none"
          />
        </label>
      </Modal>
    </div>
  )
}

const ROTULO_ABA: Record<Aba, string> = {
  pendente: 'Pendentes',
  aprovado: 'Aprovados',
  rejeitado: 'Rejeitados',
}

const TIPO_ORDEM: TipoDocumento[] = ['rg', 'cpf', 'matricula', 'residencia']
