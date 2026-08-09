import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { BUCKET_DOCUMENTOS, mensagemErro, supabase } from '../../lib/supabase'
import { badgeDocumental, dataHoraBR } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { CarregandoCards, ErroCarregamento } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeArquivo, IconeInfo, IconeUpload } from '../../components/icons'
import { ROTULO_DOCUMENTO, TIPOS_DOCUMENTO, type Documento, type TipoDocumento } from '../../lib/types'

/**
 * RF02 — envio e reenvio de documentos pelo estudante.
 * Documento aprovado não pode ser substituído; rejeitado ou pendente sim.
 */
export default function MeusDocumentos() {
  const { estudanteId } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [enviando, setEnviando] = useState<TipoDocumento | null>(null)

  const { data: documentos, isLoading, error } = useQuery({
    queryKey: ['meus-documentos', estudanteId],
    enabled: !!estudanteId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('documento')
        .select('*')
        .eq('estudante_id', estudanteId!)
      if (err) throw err
      return data as Documento[]
    },
  })

  const porTipo = new Map((documentos ?? []).map((d) => [d.tipo, d]))

  const enviar = useMutation({
    mutationFn: async ({ tipo, arquivo }: { tipo: TipoDocumento; arquivo: File }) => {
      if (!estudanteId) throw new Error('Cadastro de estudante não encontrado.')

      const extensao = arquivo.name.split('.').pop() ?? 'pdf'
      const caminho = `${estudanteId}/${tipo}-${Date.now()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .upload(caminho, arquivo, { upsert: true })
      if (erroUpload) throw erroUpload

      const existente = porTipo.get(tipo)
      if (existente) {
        // Reenvio: remove o registro antigo e recria como pendente.
        // A policy só permite excluir o próprio documento fora do estado aprovado.
        const { error: erroDelete } = await supabase
          .from('documento')
          .delete()
          .eq('id', existente.id)
        if (erroDelete) throw erroDelete
      }

      const { error: erroDoc } = await supabase.from('documento').insert({
        estudante_id: estudanteId,
        tipo,
        nome_arquivo: arquivo.name,
        storage_path: caminho,
        status: 'pendente',
      })
      if (erroDoc) throw erroDoc
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meus-documentos'] })
      qc.invalidateQueries({ queryKey: ['minha-rota'] })
      toast.sucesso('Documento enviado. Aguarde a análise do setor de transporte.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
    onSettled: () => setEnviando(null),
  })

  async function abrir(doc: Documento) {
    const { data, error: err } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(doc.storage_path, 300)
    if (err || !data?.signedUrl) {
      toast.erro('Não foi possível abrir o arquivo.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (isLoading) return <CarregandoCards itens={4} altura={130} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />

  const aprovados = (documentos ?? []).filter((d) => d.status === 'aprovado').length

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Meus documentos</h1>
        <div className="mt-1 text-[13px] text-muted">
          {aprovados} de 4 aprovados — a alocação exige os quatro (RN01).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TIPOS_DOCUMENTO.map((tipo) => {
          const doc = porTipo.get(tipo)
          const bloqueado = doc?.status === 'aprovado'
          return (
            <div key={tipo} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{ROTULO_DOCUMENTO[tipo]}</div>
                  {doc ? (
                    <button
                      onClick={() => abrir(doc)}
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
                  Documento aprovado — não é necessário reenviar.
                </div>
              ) : (
                <label className="btn-ghost mt-3 w-full cursor-pointer">
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
                        enviar.mutate({ tipo, arquivo: f })
                      }
                    }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3.5 text-[12px] text-muted">
        <span className="mt-px shrink-0 text-primary">
          <IconeInfo size={15} />
        </span>
        Seus arquivos ficam em um bucket privado — apenas você e o setor de transporte têm acesso.
        Todo reenvio volta ao status <b>pendente</b> e precisa de nova aprovação.
      </div>
    </div>
  )
}
