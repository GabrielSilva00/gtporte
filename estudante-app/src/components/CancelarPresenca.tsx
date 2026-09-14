import { useEffect, useState } from 'react'
import { Bus, Send, X } from 'lucide-react'
import { erroMsg, supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'

export type MotivoCancelamento =
  | 'troquei_de_onibus'
  | 'aula_cancelada'
  | 'saida_antecipada'
  | 'problema_saude'
  | 'compromisso_pessoal'
  | 'outro'

const MOTIVOS: { id: MotivoCancelamento; rotulo: string }[] = [
  { id: 'troquei_de_onibus', rotulo: 'Troquei de ônibus' },
  { id: 'aula_cancelada', rotulo: 'Aula cancelada' },
  { id: 'saida_antecipada', rotulo: 'Vou sair mais cedo' },
  { id: 'problema_saude', rotulo: 'Problema de saúde' },
  { id: 'compromisso_pessoal', rotulo: 'Compromisso pessoal' },
  { id: 'outro', rotulo: 'Outro motivo' },
]

interface RotaTroca {
  rota_id: string
  codigo: string
  nome: string
  horario_retorno: string
  motorista: string
  origem: string | null
  destino: string | null
  vagas_volta: number
}

/**
 * Cancelamento de presenca com motivo padronizado.
 *
 * "Troquei de onibus" abre a escolha da rota de volta: a troca vai para
 * o motorista daquela rota, que aceita ou recusa — e quem responde pela
 * lotacao do veiculo e ele.
 */
export function CancelarPresenca({
  trecho,
  ocupado,
  onConfirmar,
  onFechar,
}: {
  trecho: 'ida' | 'volta'
  ocupado: boolean
  onConfirmar: (dados: {
    motivo: MotivoCancelamento
    texto: string
    rotaDestinoId?: string
  }) => Promise<void>
  onFechar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoCancelamento | ''>('')
  const [texto, setTexto] = useState('')
  const [rotas, setRotas] = useState<RotaTroca[]>([])
  const [rotaDestino, setRotaDestino] = useState('')
  const [carregandoRotas, setCarregandoRotas] = useState(false)

  const trocaDeOnibus = motivo === 'troquei_de_onibus'

  // As rotas só são buscadas quando o motivo exige — evita consulta à toa.
  useEffect(() => {
    if (!trocaDeOnibus) return
    let vivo = true
    setCarregandoRotas(true)
    ;(async () => {
      const { data } = await supabase.rpc('rotas_para_troca')
      if (!vivo) return
      setRotas((data as RotaTroca[]) ?? [])
      setCarregandoRotas(false)
    })()
    return () => {
      vivo = false
    }
  }, [trocaDeOnibus])

  const valido =
    motivo !== '' &&
    (motivo !== 'outro' || texto.trim().length > 2) &&
    (!trocaDeOnibus || rotaDestino !== '')

  const enviar = async () => {
    if (!valido || !motivo) return
    await onConfirmar({
      motivo,
      texto: texto.trim() || MOTIVOS.find((m) => m.id === motivo)!.rotulo,
      rotaDestinoId: trocaDeOnibus ? rotaDestino : undefined,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={ocupado ? undefined : onFechar}
    >
      <div
        className="anim-in flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-surface sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line/60 px-6 py-4">
          <h3 className="text-lg font-bold">
            Cancelar {trecho === 'ida' ? 'a ida' : 'a volta'}
          </h3>
          <button onClick={onFechar} disabled={ocupado} aria-label="Fechar">
            <X className="h-5 w-5 text-faint" />
          </button>
        </div>

        {/* O conteudo rola; os botoes ficam fixos no rodape e nunca somem. */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs text-muted">
            Informe o motivo. Isso libera sua vaga para outro estudante.
          </p>

          <div className="space-y-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMotivo(m.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  motivo === m.id
                    ? 'border-brand-500 bg-brand-500/10 font-semibold text-brand-500'
                    : 'border-line text-ink'
                }`}
              >
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    motivo === m.id ? 'border-brand-500 bg-brand-500' : 'border-line'
                  }`}
                />
                {m.rotulo}
              </button>
            ))}
          </div>

          {trocaDeOnibus && (
            <div className="mt-4 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand-500">
                  <Bus className="h-3.5 w-3.5" />
                  Em qual rota você vai voltar?
                </span>
                {carregandoRotas ? (
                  <div className="flex justify-center py-3">
                    <Spinner />
                  </div>
                ) : rotas.length === 0 ? (
                  <p className="py-2 text-xs text-muted">
                    Nenhuma outra rota atende sua universidade hoje.
                  </p>
                ) : (
                  <select
                    className="field"
                    value={rotaDestino}
                    onChange={(e) => setRotaDestino(e.target.value)}
                  >
                    <option value="">Selecione a rota…</option>
                    {rotas.map((r) => (
                      <option key={r.rota_id} value={r.rota_id} disabled={r.vagas_volta <= 0}>
                        {r.codigo} — {r.nome} · volta {r.horario_retorno?.slice(0, 5)}
                        {r.vagas_volta <= 0 ? ' (sem vaga)' : ` · ${r.vagas_volta} vaga(s)`}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <p className="mt-2 text-[11px] text-muted">
                O motorista dessa rota recebe sua solicitação e precisa aceitar. Você acompanha a
                resposta aqui mesmo.
              </p>
            </div>
          )}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Detalhes {motivo === 'outro' ? '(obrigatório)' : '(opcional)'}
            </span>
            <textarea
              className="field min-h-[70px] resize-none"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Algo que a secretaria ou o motorista precise saber…"
            />
          </label>
        </div>

        <div className="flex gap-2.5 border-t border-line/60 px-6 py-4 pb-8">
          <button onClick={onFechar} disabled={ocupado} className="btn-outline">
            Voltar
          </button>
          <button
            onClick={enviar}
            disabled={!valido || ocupado}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {ocupado ? <Spinner /> : (
              <>
                <Send className="h-4 w-4" />
                {trocaDeOnibus ? 'Enviar solicitação' : 'Confirmar'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
