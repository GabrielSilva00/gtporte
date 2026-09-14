import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

/**
 * QR de embarque do estudante.
 *
 * O conteudo e o prontuario puro, sem URL nem prefixo: o leitor do app do
 * motorista (motorista-app/src/lib/qr.ts) pega a maior sequencia de digitos
 * do que leu, e e o mesmo codigo que ele digita na busca manual.
 *
 * Fundo claro com modulos escuros mesmo no tema escuro — camera de celular
 * le muito melhor assim, e o embarque acontece com pouca luz.
 */
export function QrEmbarque({ prontuario, tamanho = 200 }: { prontuario: string; tamanho?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !prontuario) return
    setPronto(false)
    QRCode.toCanvas(canvas, prontuario, {
      width: tamanho,
      margin: 1,
      color: { dark: '#1B1D1E', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(() => setPronto(true))
      .catch(() => setErro('Não foi possível gerar o QR.'))
  }, [prontuario, tamanho])

  if (erro) {
    return (
      <div className="rounded-xl bg-err/10 px-4 py-3 text-center text-sm text-err">
        {erro}
        <p className="mt-1 text-xs text-muted">Informe o prontuário {prontuario} ao motorista.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-3 shadow-card">
        {!pronto && (
          <div className="flex items-center justify-center" style={{ width: tamanho, height: tamanho }}>
            <Spinner />
          </div>
        )}
        <canvas ref={canvasRef} className={pronto ? 'block' : 'hidden'} />
      </div>
      <p className="font-mono text-sm font-semibold tracking-wider">{prontuario}</p>
    </div>
  )
}

/** Folha inferior com o QR, aberta logo apos confirmar a ida. */
export function ModalQr({
  prontuario,
  trecho,
  onFechar,
}: {
  prontuario: string
  trecho: 'ida' | 'volta'
  onFechar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="anim-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">
              {trecho === 'ida' ? 'Ida confirmada' : 'Volta confirmada'}
            </h3>
            <p className="mt-0.5 text-sm text-muted">Mostre este código ao motorista no embarque.</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-faint" />
          </button>
        </div>

        <QrEmbarque prontuario={prontuario} tamanho={220} />

        <p className="mt-4 text-center text-xs text-muted">
          Sem leitura? O motorista também pode digitar o número acima.
        </p>

        <button onClick={onFechar} className="btn-primary mt-5">
          Fechar
        </button>
      </div>
    </div>
  )
}
