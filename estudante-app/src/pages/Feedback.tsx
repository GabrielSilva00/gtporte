import { useCallback, useEffect, useState } from 'react'
import { Clock, Lock, MessageCircle, Plus, Send, User, X } from 'lucide-react'
import { erroMsg, supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

type MotivoMsg =
  | 'atraso'
  | 'ausencia'
  | 'troca_rota'
  | 'horario'
  | 'documentacao'
  | 'veiculo'
  | 'comportamento'
  | 'outro'

const MOTIVOS: { id: MotivoMsg; rotulo: string }[] = [
  { id: 'atraso', rotulo: 'Atraso do ônibus' },
  { id: 'ausencia', rotulo: 'Vou faltar' },
  { id: 'troca_rota', rotulo: 'Troca de rota' },
  { id: 'horario', rotulo: 'Mudança de horário' },
  { id: 'documentacao', rotulo: 'Documentação' },
  { id: 'veiculo', rotulo: 'Problema no veículo' },
  { id: 'comportamento', rotulo: 'Conduta' },
  { id: 'outro', rotulo: 'Outro assunto' },
]

const ROTULO_MOTIVO = Object.fromEntries(MOTIVOS.map((m) => [m.id, m.rotulo])) as Record<
  MotivoMsg,
  string
>

interface Destinatario {
  id: string | null
  nome: string
  papel: string
}

interface Msg {
  id: string
  assunto: string
  corpo: string
  criado_em: string
  expira_em: string | null
  status: 'aberta' | 'respondida' | 'encerrada'
  motivo: MotivoMsg | null
  remetente_id: string | null
  destinatario_id: string | null
}

/** Quanto falta para a mensagem encerrar, em texto curto. */
function restante(expira: string | null) {
  if (!expira) return null
  const ms = new Date(expira).getTime() - Date.now()
  if (ms <= 0) return null
  const horas = Math.floor(ms / 3_600_000)
  if (horas >= 1) return `${horas}h restantes`
  return `${Math.max(1, Math.floor(ms / 60_000))} min restantes`
}

export function Feedback() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [destinos, setDestinos] = useState<Destinatario[]>([])
  const [meuId, setMeuId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [show, setShow] = useState(false)
  const [paraId, setParaId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState<MotivoMsg | ''>('')
  const [corpo, setCorpo] = useState('')
  const [busy, setBusy] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setMeuId(user.id)

    // Fecha o que passou das 24h antes de listar, para o status exibido
    // ser o real e nao o que estava gravado.
    await supabase.rpc('encerrar_mensagens_vencidas')

    const [lista, dest] = await Promise.all([
      supabase
        .from('mensagem')
        .select('id,assunto,corpo,criado_em,expira_em,status,motivo,remetente_id,destinatario_id')
        .or(`remetente_id.eq.${user.id},destinatario_id.eq.${user.id}`)
        .order('criado_em', { ascending: false })
        .limit(50),
      supabase.rpc('destinatarios_mensagem'),
    ])

    setMsgs((lista.data as Msg[]) ?? [])
    setDestinos((dest.data as Destinatario[]) ?? [{ id: null, nome: 'Secretaria', papel: 'secretaria' }])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const enviar = async () => {
    if (!motivo || !corpo.trim()) return
    setBusy(true)
    try {
      const alvo = destinos.find((d) => (d.id ?? '') === (paraId ?? ''))
      const { error } = await supabase.from('mensagem').insert({
        destinatario_id: paraId,
        motivo,
        assunto: ROTULO_MOTIVO[motivo],
        corpo: corpo.trim(),
      })
      if (error) throw new Error(erroMsg(error))
      toast(`Mensagem enviada para ${alvo?.nome ?? 'a secretaria'}.`)
      setCorpo('')
      setMotivo('')
      setShow(false)
      await refresh()
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const nomeDe = (id: string | null) =>
    destinos.find((d) => (d.id ?? null) === id)?.nome ?? (id === null ? 'Secretaria' : 'Secretaria')

  return (
    <div className="space-y-4 px-4 pb-24 pt-16">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Mensagens</h2>
          <p className="text-xs text-muted">Ficam abertas por 24 horas.</p>
        </div>
        <button
          onClick={() => setShow(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-card"
        >
          <Plus className="h-4 w-4" />
          Nova
        </button>
      </div>

      {show && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShow(false)}
        >
          <div
            className="anim-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Nova mensagem</h3>
              <button onClick={() => setShow(false)} aria-label="Fechar">
                <X className="h-5 w-5 text-faint" />
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Para quem</span>
              <select
                className="field"
                value={paraId ?? ''}
                onChange={(e) => setParaId(e.target.value || null)}
              >
                {destinos.map((d) => (
                  <option key={d.id ?? 'secretaria'} value={d.id ?? ''}>
                    {d.papel === 'motorista' ? `Motorista › ${d.nome}` : d.nome}
                  </option>
                ))}
              </select>
              {destinos.length === 1 && (
                <span className="mt-1 block text-[11px] text-faint">
                  O motorista aparece aqui quando você estiver alocado em uma rota.
                </span>
              )}
            </label>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Motivo</span>
              <select
                className="field"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoMsg)}
              >
                <option value="">Selecione…</option>
                {MOTIVOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Mensagem</span>
              <textarea
                className="field min-h-[110px] resize-none"
                placeholder="Descreva o que aconteceu…"
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
              />
            </label>

            <button
              onClick={enviar}
              disabled={busy || !motivo || !corpo.trim()}
              className="btn-primary mt-4 flex items-center justify-center gap-2"
            >
              {busy ? <Spinner /> : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : msgs.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <MessageCircle className="mb-3 h-12 w-12 text-faint/40" />
          <p className="text-sm text-muted">Nenhuma mensagem</p>
        </div>
      ) : (
        <div className="space-y-2">
          {msgs.map((m, i) => {
            const minha = m.remetente_id === meuId
            const encerrada = m.status === 'encerrada'
            const falta = encerrada ? null : restante(m.expira_em)

            return (
              <button
                key={m.id}
                onClick={() => setAberta(aberta === m.id ? null : m.id)}
                style={{ animationDelay: `${i * 30}ms` }}
                className={`card anim-in w-full text-left ${encerrada ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {m.motivo ? ROTULO_MOTIVO[m.motivo] : m.assunto}
                  </p>
                  {encerrada ? (
                    <span className="chip bg-raised text-muted">
                      <Lock className="h-3 w-3" />
                      Encerrada
                    </span>
                  ) : (
                    falta && (
                      <span className="chip-warn">
                        <Clock className="h-3 w-3" />
                        {falta}
                      </span>
                    )
                  )}
                </div>

                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                  <User className="h-3 w-3" />
                  {minha ? `Você → ${nomeDe(m.destinatario_id)}` : `${nomeDe(m.remetente_id)} → você`}
                  <span className="text-faint">· {fmt(m.criado_em)}</span>
                </p>

                {aberta === m.id && (
                  <p className="mt-3 rounded-xl bg-raised/60 p-3 text-sm leading-relaxed text-ink/80">
                    {m.corpo}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
