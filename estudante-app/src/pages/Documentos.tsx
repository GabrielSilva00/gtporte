import { useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useDocumentos, ROTULO_DOC, TIPOS_DOC, type TipoDoc } from '@/hooks/useEstudante'
import { erroMsg, supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'
import { Confirmacao } from '@/components/Confirmacao'
import { toast } from '@/components/Toast'

const COR: Record<string, { icon: typeof CheckCircle; cls: string; label: string }> = {
  aprovado: { icon: CheckCircle, cls: 'text-ok', label: 'Aprovado' },
  pendente: { icon: Clock, cls: 'text-warn', label: 'Em análise' },
  rejeitado: { icon: XCircle, cls: 'text-err', label: 'Rejeitado' },
}

type Pendente = { tipo: TipoDoc; acao: 'enviar' | 'remover'; arquivo?: File }

export function Documentos({ estudanteId }: { estudanteId: string }) {
  const { docs, loading, refresh } = useDocumentos(estudanteId)
  const [busy, setBusy] = useState<TipoDoc | null>(null)
  const [confirmando, setConfirmando] = useState<Pendente | null>(null)
  const [abrindo, setAbrindo] = useState<TipoDoc | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  const porTipo = new Map(docs.map((d) => [d.tipo, d]))
  const faltando = TIPOS_DOC.filter((t) => !porTipo.has(t))

  /**
   * O bucket e privado: para ver o arquivo e preciso uma URL assinada,
   * valida por poucos minutos.
   */
  const visualizar = async (tipo: TipoDoc) => {
    const doc = porTipo.get(tipo)
    if (!doc) return
    setAbrindo(tipo)
    try {
      const { data, error } = await supabase.storage
        .from('documentos')
        .createSignedUrl(doc.storage_path, 300)
      if (error || !data) throw new Error(erroMsg(error))
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast(erroMsg(e), 'err')
    } finally {
      setAbrindo(null)
    }
  }

  /** Envio e reenvio passam pela funcao do banco, que devolve o documento a 'pendente'. */
  const enviar = async (tipo: TipoDoc, arquivo: File) => {
    setBusy(tipo)
    try {
      const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const caminho = `${estudanteId}/${tipo}-${Date.now()}.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from('documentos')
        .upload(caminho, arquivo, { upsert: true })
      if (erroUpload) throw new Error(erroMsg(erroUpload))

      const { error } = await supabase.rpc('reenviar_documento', {
        p_tipo: tipo,
        p_nome_arquivo: arquivo.name,
        p_storage_path: caminho,
      })
      if (error) throw new Error(erroMsg(error))

      toast('Documento enviado! Aguarde a validação da secretaria.')
      await refresh()
    } catch (e) {
      toast(erroMsg(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const remover = async (tipo: TipoDoc) => {
    setBusy(tipo)
    try {
      const { data, error } = await supabase.rpc('remover_documento', { p_tipo: tipo })
      if (error) throw new Error(erroMsg(error))
      // A funcao devolve o caminho; o arquivo em si sai do storage aqui.
      if (typeof data === 'string' && data) {
        await supabase.storage.from('documentos').remove([data])
      }
      toast('Documento removido.')
      await refresh()
    } catch (e) {
      toast(erroMsg(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const confirmar = async () => {
    if (!confirmando) return
    const { tipo, acao, arquivo } = confirmando
    setConfirmando(null)
    if (acao === 'remover') await remover(tipo)
    else if (arquivo) await enviar(tipo, arquivo)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-24 pt-16">
      <div>
        <h2 className="text-lg font-bold">Meus Documentos</h2>
        <p className="text-xs text-muted">
          A alocação em uma rota acontece quando os quatro forem aprovados.
        </p>
      </div>

      {faltando.length > 0 && (
        <div className="aviso-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-semibold text-warn">Documentos pendentes</p>
            <p className="mt-0.5 text-xs text-muted">
              {faltando.map((t) => ROTULO_DOC[t]).join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {TIPOS_DOC.map((tipo, i) => {
          const doc = porTipo.get(tipo)
          const st = doc ? COR[doc.status] : null
          const StIcon = st?.icon ?? FileText
          const aprovado = doc?.status === 'aprovado'

          return (
            <div key={tipo} className="card anim-in" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      doc ? 'bg-brand-500/10 text-brand-500' : 'bg-raised text-faint'
                    }`}
                  >
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ROTULO_DOC[tipo]}</p>
                    <p className="truncate text-[11px] text-muted">
                      {doc ? doc.nome_arquivo : 'Não enviado'}
                    </p>
                  </div>
                </div>
                {st && (
                  <div className={`flex shrink-0 items-center gap-1 ${st.cls}`}>
                    <StIcon className="h-4 w-4" />
                    <span className="text-[11px] font-semibold">{st.label}</span>
                  </div>
                )}
              </div>

              {doc?.status === 'rejeitado' && doc.observacao && (
                <div className="mt-2 rounded-lg bg-err/10 p-2.5 text-xs text-err">
                  <b>Motivo da recusa:</b> {doc.observacao}
                </div>
              )}

              {aprovado && (
                <p className="mt-2 text-[11px] text-muted">
                  Documento aprovado. Para substituí-lo, procure a secretaria.
                </p>
              )}

              <input
                ref={(el) => {
                  refs.current[tipo] = el
                }}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  // Reenviar substitui o anterior: confirma antes.
                  if (doc) setConfirmando({ tipo, acao: 'enviar', arquivo: f })
                  else enviar(tipo, f)
                  e.target.value = ''
                }}
              />

              <div className="mt-3 flex gap-2">
                {doc && (
                  <button
                    onClick={() => visualizar(tipo)}
                    disabled={abrindo === tipo}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-raised/70 py-2 text-xs font-semibold text-ink"
                  >
                    {abrindo === tipo ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    Visualizar
                  </button>
                )}

                {!aprovado && (
                  <button
                    onClick={() => refs.current[tipo]?.click()}
                    disabled={busy === tipo}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600/10 py-2 text-xs font-semibold text-brand-500"
                  >
                    {busy === tipo ? (
                      <Spinner className="h-4 w-4" />
                    ) : doc ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {doc ? 'Atualizar' : 'Enviar'}
                  </button>
                )}

                {doc && !aprovado && (
                  <button
                    onClick={() => setConfirmando({ tipo, acao: 'remover' })}
                    disabled={busy === tipo}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-err/10 px-3 py-2 text-xs font-semibold text-err"
                    aria-label={`Remover ${ROTULO_DOC[tipo]}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {confirmando && (
        <Confirmacao
          titulo={confirmando.acao === 'remover' ? 'Remover documento' : 'Substituir documento'}
          mensagem={
            confirmando.acao === 'remover'
              ? `O ${ROTULO_DOC[confirmando.tipo]} será apagado e sairá da fila de validação. Você poderá enviar outro depois.`
              : `O ${ROTULO_DOC[confirmando.tipo]} atual será substituído e voltará para análise da secretaria.`
          }
          detalhe={confirmando.arquivo ? `Novo arquivo: ${confirmando.arquivo.name}` : undefined}
          rotuloConfirmar={confirmando.acao === 'remover' ? 'Remover' : 'Substituir'}
          perigo={confirmando.acao === 'remover'}
          ocupado={busy === confirmando.tipo}
          onConfirmar={confirmar}
          onCancelar={() => setConfirmando(null)}
        />
      )}
    </div>
  )
}
