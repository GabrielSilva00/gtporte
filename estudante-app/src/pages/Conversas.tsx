import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  Building2,
  Bus,
  Lock,
  MessageCircle,
  Plus,
  Send,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  useConversas,
  useMensagensConversa,
  useMotivos,
  type Conversa,
  type DestinoConversa,
  type MensagemConversa,
} from '@/hooks/useConversas'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const quandoLista = (iso: string) => {
  const d = new Date(iso)
  const hoje = new Date()
  return d.toDateString() === hoje.toDateString()
    ? hora(iso)
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function IconeConversa({ c, tamanho = 'h-5 w-5' }: { c: Conversa; tamanho?: string }) {
  if (c.tipo === 'grupo') return <Users className={tamanho} />
  if (c.destino === 'secretaria') return <Building2 className={tamanho} />
  return <UserRound className={tamanho} />
}

/**
 * Bolha de mensagem. No grupo da rota todas as mensagens levam o nome de
 * quem enviou, e as do motorista tem destaque proprio: sao avisos que
 * valem para a rota inteira.
 */
function Bolha({
  m,
  meu,
  grupo,
}: {
  m: MensagemConversa
  meu: boolean
  grupo: boolean
}) {
  const doMotorista = m.autor_tipo === 'motorista'
  const daSecretaria = m.autor_tipo === 'admin' || m.autor_tipo === 'operador'
  const mostrarNome = grupo || !meu

  if (m.eh_bot) {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-raised/70 px-3 py-1 text-center text-[11px] text-muted">
          {m.corpo}
        </p>
      </div>
    )
  }

  if (grupo && doMotorista) {
    return (
      <div className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
        <div className="w-[88%] rounded-2xl border-2 border-warn/60 bg-warn/10 px-3.5 py-2.5 shadow-card">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-warn">
            <Bus className="h-3.5 w-3.5" />
            {m.autor_nome ?? 'Motorista'}
            <span className="rounded-full bg-warn px-1.5 py-px text-[9.5px] uppercase tracking-wide text-white">
              Motorista
            </span>
          </p>
          <p className="text-[14.5px] font-medium leading-relaxed text-ink">{m.corpo}</p>
          <p className="mt-1 text-[10px] text-warn/80">{hora(m.criado_em)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
          meu ? 'bg-brand-600 text-white' : 'bg-surface shadow-card'
        }`}
      >
        {mostrarNome && (
          <p
            className={`mb-0.5 text-[10.5px] font-semibold ${
              meu ? 'text-white/80' : daSecretaria ? 'text-brand-500' : doMotorista ? 'text-warn' : 'text-muted'
            }`}
          >
            {meu ? `${m.autor_nome ?? 'Você'} (você)` : (m.autor_nome ?? 'Participante')}
          </p>
        )}
        <p className={`whitespace-pre-wrap text-sm leading-relaxed ${meu ? '' : 'text-ink'}`}>
          {m.corpo}
        </p>
        <p className={`mt-1 text-[10px] ${meu ? 'text-white/60' : 'text-faint'}`}>
          {hora(m.criado_em)}
        </p>
      </div>
    </div>
  )
}

/** Conversa aberta: bolhas, quem falou e o campo de envio. */
function ConversaAberta({ conversa, onVoltar }: { conversa: Conversa; onVoltar: () => void }) {
  const { msgs, loading, erro, meuId, enviar, encerrar } = useMensagensConversa(conversa.id)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const grupo = conversa.tipo === 'grupo'

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length])

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
    <div className="flex h-[100dvh] flex-col pt-[3.25rem]">
      <div className="flex items-center gap-2.5 border-b border-line/60 px-4 py-3">
        <button onClick={onVoltar} aria-label="Voltar para a lista" className="p-1">
          <ArrowLeft className="h-5 w-5 text-ink" />
        </button>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            grupo ? 'bg-ok/10 text-ok' : 'bg-brand-500/10 text-brand-500'
          }`}
        >
          <IconeConversa c={conversa} tamanho="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{conversa.titulo}</p>
          <p className="truncate text-[11px] text-muted">
            {grupo
              ? `${conversa.participantes} participantes`
              : `Motivo: ${conversa.assunto ?? '—'}`}
          </p>
        </div>
        {!grupo && conversa.situacao !== 'encerrada' && (
          <button
            onClick={async () => {
              try {
                await encerrar()
                toast('Conversa encerrada.')
                onVoltar()
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
            className="shrink-0 text-[11px] font-semibold text-muted underline"
          >
            Encerrar
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : erro ? (
          <div className="aviso-err mx-2">
            <p className="text-xs text-muted">
              <b className="text-err">Não foi possível abrir a conversa.</b> {erro}
            </p>
          </div>
        ) : msgs.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">
            {grupo ? 'Nenhuma mensagem no grupo ainda.' : 'Nenhuma mensagem ainda.'}
          </p>
        ) : (
          msgs.map((m) => (
            <Bolha key={m.id} m={m} meu={m.autor_id === meuId} grupo={grupo} />
          ))
        )}
        {conversa.situacao === 'encerrada' && !loading && (
          <p className="pt-2 text-center text-[11px] text-faint">
            Conversa encerrada. Enviar uma mensagem reabre o atendimento.
          </p>
        )}
        <div ref={fimRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line/60 bg-surface px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <textarea
          className="field max-h-24 min-h-[42px] flex-1 resize-none py-2.5"
          placeholder={grupo ? 'Mensagem para o grupo…' : 'Escreva sua mensagem…'}
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
 * Nova conversa direta: o estudante escolhe o motivo (lista mantida pela
 * secretaria) e escreve a primeira mensagem.
 */
function NovaConversa({
  destino,
  onFechar,
  onCriar,
}: {
  destino: DestinoConversa
  onFechar: () => void
  onCriar: (motivoId: string, mensagem: string) => Promise<void>
}) {
  const motivos = useMotivos().filter((m) => m.destino === destino)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  const pronto = !!motivo && mensagem.trim().length > 0

  // Portal: dentro da lista, o painel herdaria a margem do space-y.
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="anim-in max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-bold">
            Falar com {destino === 'secretaria' ? 'a secretaria' : 'o motorista'}
          </h3>
          <button onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5 text-faint" />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold text-muted">Motivo da conversa</p>
        {motivos.length === 0 ? (
          <p className="mb-4 rounded-xl bg-raised/60 p-3 text-xs text-muted">
            Nenhum motivo cadastrado pela secretaria para este contato.
          </p>
        ) : (
          <div className="mb-4 flex flex-col gap-1.5">
            {motivos.map((m) => {
              const sel = motivo === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setMotivo(m.id)}
                  aria-pressed={sel}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    sel ? 'border-brand-500 bg-brand-500/10' : 'border-line/60'
                  }`}
                >
                  <span className={`block text-sm font-semibold ${sel ? 'text-brand-500' : ''}`}>
                    {m.titulo}
                  </span>
                  {m.descricao && (
                    <span className="block text-[11px] text-muted">{m.descricao}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Mensagem</span>
          <textarea
            className="field min-h-[96px] resize-none"
            placeholder="Descreva o que você precisa…"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
          />
        </label>

        <button
          disabled={!pronto || enviando}
          onClick={async () => {
            if (!motivo) return
            setEnviando(true)
            try {
              await onCriar(motivo, mensagem)
            } finally {
              setEnviando(false)
            }
          }}
          className="btn-primary mt-4 flex items-center justify-center gap-2"
        >
          {enviando ? (
            <Spinner />
          ) : (
            <>
              <Send className="h-4 w-4" />
              Enviar
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Mensagens do estudante em duas abas: atendimento direto (secretaria ou
 * motorista, sempre com um motivo) e o grupo da rota, onde motorista e
 * estudantes conversam. Antes da validacao do cadastro so a secretaria
 * fica disponivel.
 */
export function Conversas({ validado }: { validado: boolean }) {
  const { diretas, grupos, loading, abrirDireta, refresh } = useConversas()
  const [aba, setAba] = useState<'direta' | 'grupo'>('direta')
  const [aberta, setAberta] = useState<Conversa | null>(null)
  const [nova, setNova] = useState<DestinoConversa | null>(null)

  if (aberta) {
    return (
      <ConversaAberta
        conversa={aberta}
        onVoltar={() => {
          setAberta(null)
          refresh()
        }}
      />
    )
  }

  const lista = aba === 'direta' ? diretas : grupos

  return (
    <div className="space-y-3 px-4 pb-10 pt-16">
      <div className="flex rounded-xl bg-raised/70 p-1">
        {(['direta', 'grupo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              aba === t ? 'bg-surface text-brand-500 shadow-card' : 'text-muted'
            }`}
          >
            {t === 'direta' ? 'Atendimento' : 'Grupo da rota'}
            {t === 'grupo' && !validado && <Lock className="h-3 w-3" />}
          </button>
        ))}
      </div>

      {aba === 'direta' && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setNova('secretaria')}
            className="card flex flex-col items-center gap-2 py-4 transition-transform active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-semibold">Secretaria</span>
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <Plus className="h-3 w-3" />
              Nova conversa
            </span>
          </button>

          <button
            onClick={() => (validado ? setNova('motorista') : undefined)}
            disabled={!validado}
            className="card flex flex-col items-center gap-2 py-4 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ok/10 text-ok">
              {validado ? <UserRound className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </span>
            <span className="text-[13px] font-semibold">Motorista</span>
            <span className="flex items-center gap-1 text-center text-[11px] text-muted">
              {validado ? (
                <>
                  <Plus className="h-3 w-3" />
                  Nova conversa
                </>
              ) : (
                'Após a validação'
              )}
            </span>
          </button>
        </div>
      )}

      {aba === 'grupo' && !validado ? (
        <div className="card-flat py-10 text-center">
          <Lock className="mx-auto mb-2 h-9 w-9 text-warn/60" />
          <p className="px-4 text-xs text-muted">
            O grupo da rota é liberado quando a secretaria validar o seu cadastro.
          </p>
        </div>
      ) : loading ? (
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
                <IconeConversa c={c} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.titulo}</span>
                  <span className="shrink-0 text-[10.5px] text-faint">{quandoLista(c.ultima_em)}</span>
                </span>
                {c.tipo === 'direta' && (
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="chip-info px-2 py-px text-[10px]">{c.assunto ?? 'Sem motivo'}</span>
                    {c.situacao === 'encerrada' && (
                      <span className="text-[10px] text-faint">encerrada</span>
                    )}
                  </span>
                )}
                <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                  {c.ultima_msg ?? c.subtitulo}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {nova && (
        <NovaConversa
          destino={nova}
          onFechar={() => setNova(null)}
          onCriar={async (motivoId, mensagem) => {
            try {
              const c = await abrirDireta(nova, motivoId, mensagem)
              setNova(null)
              if (c) setAberta(c)
            } catch (e) {
              toast((e as Error).message, 'err')
            }
          }}
        />
      )}
    </div>
  )
}
