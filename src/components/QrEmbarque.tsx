import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR de embarque do estudante. O conteúdo é o próprio prontuário — o mesmo
 * código que o motorista digita no campo de busca do app dele, para que a
 * leitura e a digitação levem exatamente ao mesmo aluno.
 */
export function QrEmbarque({ prontuario, nome }: { prontuario: string; nome?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    QRCode.toCanvas(canvas, prontuario, {
      width: 200,
      margin: 1,
      // Fundo claro e módulos escuros: a câmera do celular lê muito melhor
      // do que um QR invertido, mesmo em ônibus com pouca luz.
      color: { dark: '#1B1D1E', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    }).catch(() => setErro('Não foi possível gerar o QR.'))
  }, [prontuario])

  return (
    <div className="card mb-4 p-5">
      <div className="eyebrow mb-3.5">QR de embarque</div>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="rounded-btn bg-white p-3">
          {erro ? (
            <div className="flex h-[200px] w-[200px] items-center justify-center text-[12px] text-muted">{erro}</div>
          ) : (
            <canvas ref={canvasRef} aria-label={`QR de embarque de ${nome ?? prontuario}`} />
          )}
        </div>
        <div className="text-[13px] text-muted">
          <div className="font-mono text-[15px] text-ink">{prontuario}</div>
          <p className="mt-2 max-w-sm">
            Mostre este código ao motorista no embarque. Ele também pode registrar sua presença
            digitando o número acima, se a câmera falhar.
          </p>
        </div>
      </div>
    </div>
  )
}
