import { useState } from 'react'
import { ArrowLeft, Bot, Bus, Building2, MessageCircle, Send, UserRound, Users } from 'lucide-react'
import {
  useConversas,
  useMensagensConversa,
  type Conversa,
  type DestinoConversa,
} from '@/hooks/useConversas'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Conversa aberta: bolhas, quem falou e o campo de envio. */
function Conversa({ conversa, onVoltar }: { conversa: Conversa; onVoltar: () => void }) {
  const { msgs, loading, meuId, enviar, escalar } = useMensagensConversa(conversa.id)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const mandar = async () => {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await enviar(texto)
      setTexto('')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex items-center gap-2.5 border-b border-line/60 px-4 py-3">
        <button onClick={onVoltar} aria-label="Voltar" className="p-1">
          <ArrowLeft className="h-5 w-5 text-ink" />
        </button>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            conversa.tipo === 'grupo' ? 'bg-ok/10 text-ok' : 'bg-brand-500/10 text-brand-500'
          }`}
        >
          {conversa.tipo === 'grupo' ? <Users className="h-4 w-4" /> : conversa.destino === 'secretaria' ? <Building2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{conversa.titulo}</p>
          <p className="truncate text-[11px] text-muted">
            {conversa.tipo === 'grupo'
              ? `${conversa.participantes} participantes`
              : conversa.situacao === 'bot'
                ? 'Atendimento automático'
                : 'Atendimento humano'}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          msgs.map((m) => {
            const meu = m.autor_id === meuId && !m.eh_bot
            return (
              <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    meu
                      ? 'bg-brand-600 text-white'
                      : m.eh_bot
                        ? 'border border-line/60 bg-raised/60'
                        : 'bg-surface shadow-card'
                  }`}
                >
                  {!meu && (
                    <p
                      className={`mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold ${
                        m.eh_bot ? 'text-brand-500' : 'text-muted'
                      }`}
                    >
                      {m.eh_bot ? (
                        <>
                          <Bot className="h-3 w-3" />
                          Assistente
                        </>
                      ) : (
                        m.autor_nome ?? 'Participante'
                      )}
                    </p>
                  )}
                  <p className={`text-sm leading-relaxed ${meu ? '' : 'text-ink'}`}>{m.corpo}</p>
                  <p className={`mt-1 text-[10px] ${meu ? 'text-white/60' : 'text-faint'}`}>
                    {hora(m.criado_em)}
                  </p>
                </div>
              </div>
            )
          })
        )}

        {conversa.tipo === 'direta' && conversa.situacao === 'bot' && !loading && (
          <div className="pt-2 text-center">
            <button
              onClick={async () => {
                try {
                  await escalar()
                  toast('Encaminhado para atendimento humano.')
                } catch (e) {
                  toast((e as Error).message, 'err')
                }
              }}
              className="text-[11.5px] font-semibold text-brand-500 underline"
            >
              Falar com {conversa.destino === 'secretaria' ? 'a secretaria' : 'o motorista'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-line/60 px-4 py-3 pb-6">
        <textarea
          className="field max-h-24 min-h-[42px] flex-1 resize-none py-2.5"
          placeholder="Escreva sua mensagem…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              mandar()
            }
          }}
        />
        <button
          onClick={mandar}
          disabled={enviando || !texto.trim()}
          aria-label="Enviar"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
        >
          {enviando ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

/**
 * Mensagens do estudante em duas abas: atendimento direto (secretaria ou
 * motorista, comecando pelo assistente) e os grupos das rotas em que ele
 * viaja, onde motorista e estudantes conversam.
 */
export function Conversas() {
  const { diretas, grupos, loading, abrirDireta, refresh } = useConversas()
  const [aba, setAba] = useState<'direta' | 'grupo'>('direta')
  const [aberta, setAberta] = useState<Conversa | null>(null)
  const [abrindo, setAbrindo] = useState<DestinoConversa | null>(null)

  if (aberta) {
    return (
      <Conversa
        conversa={aberta}
        onVoltar={() => {
          setAberta(null)
          refresh()
        }}
      />
    )
  }

  const iniciar = async (destino: DestinoConversa) => {
    setAbrindo(destino)
    try {
      const id = await abrirDireta(destino)
      const { data } = await import('@/lib/supabase').then((m) =>
        m.supabase.rpc('minhas_conversas'),
      )
      const lista = (data as Conversa[]) ?? []
      const alvo = lista.find((c) => c.id === id)
      if (alvo) setAberta(alvo)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setAbrindo(null)
    }
  }

  const lista = aba === 'direta' ? diretas : grupos

  return (
    <div className="space-y-3 px-4 pb-10 pt-16">
      <h2 className="text-lg font-bold">Mensagens</h2>

      <div className="flex rounded-xl bg-raised/70 p-1">
        {(['direta', 'grupo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              aba === t ? 'bg-surface text-brand-500 shadow-card' : 'text-muted'
            }`}
          >
            {t === 'direta' ? 'Atendimento' : 'Grupos da rota'}
          </button>
        ))}
      </div>

      {aba === 'direta' && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => iniciar('secretaria')}
            disabled={!!abrindo}
            className="card flex flex-col items-center gap-2 py-4 transition-transform active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
              {abrindo === 'secretaria' ? <Spinner /> : <Building2 className="h-5 w-5" />}
            </span>
            <span className="text-[13px] font-semibold">Secretaria</span>
            <span className="text-[11px] text-muted">Documentos, rota, cadastro</span>
          </button>

          <button
            onClick={() => iniciar('motorista')}
            disabled={!!abrindo}
            className="card flex flex-col items-center gap-2 py-4 transition-transform active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ok/10 text-ok">
              {abrindo === 'motorista' ? <Spinner /> : <UserRound className="h-5 w-5" />}
            </span>
            <span className="text-[13px] font-semibold">Motorista</span>
            <span className="text-[11px] text-muted">Da sua rota de hoje</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : lista.length === 0 ? (
        <div className="card-flat py-10 text-center">
          {aba === 'direta' ? (
            <>
              <MessageCircle className="mx-auto mb-2 h-9 w-9 text-faint/50" />
              <p className="text-xs text-muted">
                Nenhuma conversa ainda. Escolha acima com quem falar.
              </p>
            </>
          ) : (
            <>
              <Bus className="mx-auto mb-2 h-9 w-9 text-faint/50" />
              <p className="text-xs text-muted">
                Você entra no grupo assim que for alocado em uma rota.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <button
              key={c.id}
              onClick={() => setAberta(c)}
              className="card flex w-full items-center gap-3 text-left transition-transform active:scale-[0.99]"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  c.tipo === 'grupo' ? 'bg-ok/10 text-ok' : 'bg-brand-500/10 text-brand-500'
                }`}
              >
                {c.tipo === 'grupo' ? (
                  <Users className="h-5 w-5" />
                ) : c.destino === 'secretaria' ? (
                  <Building2 className="h-5 w-5" />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.titulo}</span>
                  <span className="shrink-0 text-[10.5px] text-faint">{hora(c.ultima_em)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                  {c.ultima_msg ?? c.subtitulo}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
