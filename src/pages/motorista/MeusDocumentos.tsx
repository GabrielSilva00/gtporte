import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import {
  BUCKET_DOCUMENTOS,
  caminhoArquivoMotorista,
  mensagemErro,
  supabase,
} from '../../lib/supabase'
import { badgeDocumental, dataBR, dataHoraBR, diasParaVencer } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { CarregandoCards, ErroCarregamento } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeArquivo, IconeInfo, IconeMais, IconeUpload } from '../../components/icons'
import {
  DOCUMENTOS_MOTORISTA_OBRIGATORIOS,
  DOCUMENTOS_MOTORISTA_REPETIVEIS,
  ROTULO_DOCUMENTO_MOTORISTA,
  type DocumentoMotorista,
  type TipoDocumentoMotorista,
} from '../../lib/types'

/** Ordem de exibição: os quatro obrigatórios primeiro, depois os opcionais. */
const TIPOS_UNICOS: TipoDocumentoMotorista[] = [
  ...DOCUMENTOS_MOTORISTA_OBRIGATORIOS,
  'aso',
  'contrato',
]

/**
 * Envio e reenvio de documentos pelo motorista (migration 0010).
 * Espelha a tela do estudante, com duas diferenças: alguns tipos aceitam
 * vários arquivos (certificados de curso) e há data de validade, porque
 * exame toxicológico, ASO e certificados vencem.
 */
export default function MeusDocumentosMotorista() {
  const { motoristaId } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [enviando, setEnviando] = useState<TipoDocumentoMotorista | null>(null)
  const [validades, setValidades] = useState<Partial<Record<TipoDocumentoMotorista, string>>>({})

  const { data: documentos, isLoading, error } = useQuery({
    queryKey: ['meus-documentos-motorista', motoristaId],
    enabled: !!motoristaId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('documento_motorista')
        .select('*')
        .eq('motorista_id', motoristaId!)
        .order('criado_em', { ascending: false })
      if (err) throw err
      return data as DocumentoMotorista[]
    },
  })

  const porTipo = new Map<TipoDocumentoMotorista, DocumentoMotorista>()
  for (const d of documentos ?? []) if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, d)

  const repetiveis = (documentos ?? []).filter((d) =>
    DOCUMENTOS_MOTORISTA_REPETIVEIS.includes(d.tipo),
  )

  const enviar = useMutation({
    mutationFn: async (p: {
      tipo: TipoDocumentoMotorista
      arquivo: File
      substituir?: DocumentoMotorista
    }) => {
      if (!motoristaId) throw new Error('Cadastro de motorista não encontrado.')

      const caminho = caminhoArquivoMotorista(motoristaId, p.tipo, p.arquivo)
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(caminho, p.arquivo, { upsert: true })
      if (erroUpload) throw erroUpload

      // Reenvio de um tipo de slot único: remove o registro anterior e
      // recria como pendente. A policy só permite excluir fora do aprovado.
      if (p.substituir) {
        const { error: erroDelete } = await supabase
          .from('documento_motorista')
          .delete()
          .eq('id', p.substituir.id)
        if (erroDelete) throw erroDelete
      }

      const { error: erroDoc } = await supabase.from('documento_motorista').insert({
        motorista_id: motoristaId,
        tipo: p.tipo,
        nome_arquivo: p.arquivo.name,
        storage_path: caminho,
        validade: validades[p.tipo] || null,
        status: 'pendente',
      })
      if (erroDoc) throw erroDoc
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meus-documentos-motorista'] })
      qc.invalidateQueries({ queryKey: ['fila-documentos-motorista'] })
      toast.sucesso('Documento enviado. Aguarde a análise do setor de transporte.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
    onSettled: () => setEnviando(null),
  })

  const excluir = useMutation({
    mutationFn: async (doc: DocumentoMotorista) => {
      const { error: err } = await supabase
        .from('documento_motorista')
        .delete()
        .eq('id', doc.id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meus-documentos-motorista'] })
      toast.sucesso('Documento removido.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  async function abrirArquivo(doc: DocumentoMotorista) {
    const { data, error: err } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(doc.storage_path, 300)
    if (err || !data?.signedUrl) {
      toast.erro('Não foi possível abrir o arquivo.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (isLoading) return <CarregandoCards itens={4} altura={150} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />

  const aprovados = DOCUMENTOS_MOTORISTA_OBRIGATORIOS.filter(
    (t) => porTipo.get(t)?.status === 'aprovado',
  ).length

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Meus documentos</h1>
        <div className="mt-1 text-[13px] text-muted">
          {aprovados} de {DOCUMENTOS_MOTORISTA_OBRIGATORIOS.length} obrigatórios aprovados.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TIPOS_UNICOS.map((tipo) => {
          const doc = porTipo.get(tipo)
          const bloqueado = doc?.status === 'aprovado'
          const obrigatorio = DOCUMENTOS_MOTORISTA_OBRIGATORIOS.includes(tipo)
          const restam = diasParaVencer(doc?.validade ?? null)

          return (
            <div key={tipo} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">
                    {ROTULO_DOCUMENTO_MOTORISTA[tipo]}
                    {obrigatorio && <span className="ml-1 text-accent">*</span>}
                  </div>
                  {doc ? (
                    <button
                      onClick={() => abrirArquivo(doc)}
                      className="mt-1 flex items-center gap-1.5 font-mono text-[11.5px] text-primary hover:underline"
                    >
                      <IconeArquivo size={12} />
                      <span className="truncate">{doc.nome_arquivo}</span>
                    </button>
                  ) : (
                    <div className="mt-1 text-[11.5px] text-soft">Nenhum arquivo enviado</div>
                  )}
                </div>
                <Badge estilo={badgeDocumental(doc?.status ?? 'pendente')} />
              </div>

              {doc?.validade && (
                <div
                  className={`mt-2 text-[11.5px] ${
                    restam !== null && restam < 0
                      ? 'text-danger'
                      : restam !== null && restam <= 30
                        ? 'text-warn'
                        : 'text-muted'
                  }`}
                >
                  Válido até {dataBR(doc.validade)}
                  {restam !== null &&
                    (restam < 0
                      ? ` · vencido há ${Math.abs(restam)} dia(s)`
                      : ` · faltam ${restam} dia(s)`)}
                </div>
              )}

              {doc?.observacao && (
                <div className="mt-3 rounded-btn bg-bg-danger px-3 py-2 text-[11.5px] text-danger">
                  {doc.observacao}
                </div>
              )}

              {doc && (
                <div className="mt-2.5 font-mono text-[10.5px] text-soft">
                  Enviado {dataHoraBR(doc.criado_em)}
                  {doc.revisado_em && ` · revisado ${dataHoraBR(doc.revisado_em)}`}
                </div>
              )}

              {bloqueado ? (
                <div className="mt-3 text-[11.5px] text-muted">
                  Documento aprovado, não é necessário reenviar.
                </div>
              ) : (
                <>
                  <label className="mt-3 block">
                    <span className="field-label">Válido até (opcional)</span>
                    <input
                      type="date"
                      value={validades[tipo] ?? doc?.validade ?? ''}
                      onChange={(e) => setValidades({ ...validades, [tipo]: e.target.value })}
                      className="field py-2 text-[12.5px]"
                    />
                  </label>
                  <label className="btn-ghost mt-2 w-full cursor-pointer">
                    <IconeUpload size={14} />
                    {enviando === tipo ? 'Enviando…' : doc ? 'Reenviar arquivo' : 'Enviar arquivo'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      disabled={enviar.isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) {
                          setEnviando(tipo)
                          enviar.mutate({ tipo, arquivo: f, substituir: doc })
                        }
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Certificados e outros: aceitam vários arquivos, então viram lista */}
      <div className="card mt-3.5 p-4">
        <div className="mb-1 text-[13.5px] font-medium">Certificados e outros documentos</div>
        <p className="mb-3 text-[11.5px] text-muted">
          MOPP, transporte coletivo, direção defensiva, primeiros socorros. Pode enviar quantos
          forem necessários.
        </p>

        {repetiveis.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {repetiveis.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-field border border-edge px-3 py-2"
              >
                <button
                  onClick={() => abrirArquivo(d)}
                  className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-primary hover:underline"
                >
                  <IconeArquivo size={12} />
                  <span className="truncate">{d.nome_arquivo}</span>
                </button>
                {d.validade && (
                  <span className="text-[11px] text-muted">até {dataBR(d.validade)}</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Badge estilo={badgeDocumental(d.status)} />
                  {d.status !== 'aprovado' && (
                    <button
                      onClick={() => excluir.mutate(d)}
                      disabled={excluir.isPending}
                      className="text-[11px] text-danger hover:underline"
                    >
                      remover
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[160px] flex-1">
            <span className="field-label">Válido até (opcional)</span>
            <input
              type="date"
              value={validades.certificado ?? ''}
              onChange={(e) => setValidades({ ...validades, certificado: e.target.value })}
              className="field py-2 text-[12.5px]"
            />
          </label>
          <label className="btn-ghost cursor-pointer">
            <IconeMais size={13} />
            {enviando === 'certificado' ? 'Enviando…' : 'Adicionar certificado'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              disabled={enviar.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setEnviando('certificado')
                  enviar.mutate({ tipo: 'certificado', arquivo: f })
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3.5 text-[12px] text-muted">
        <span className="mt-px shrink-0 text-primary">
          <IconeInfo size={15} />
        </span>
        Seus arquivos ficam em um bucket privado, apenas você e o setor de transporte têm acesso.
        Todo reenvio volta ao status <b>pendente</b> e precisa de nova aprovação.
      </div>
    </div>
  )
}
