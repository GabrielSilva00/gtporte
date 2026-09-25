import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, MessageCircle, Send, UserRound, Users } from 'lucide-react'
import { useMensagensConversa, type ConversaMot, type ConversasMotorista } from '@/hooks/useMotorista'
import { Mensagens } from '@/pages/Mensagens'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/Toast'

type Aba = 'alunos' | 'grupos' | 'secretaria'

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const quando = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? hora(iso)
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function ConversaAberta({ c, onVoltar }: { c: ConversaMot; onVoltar: () => void }) {
  const { msgs, loading, meuId, enviar, encerrar } = useMensagensConversa(c.id)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const grupo = c.tipo === 'grupo'

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length])

  const mandar = async () => {
    if (!texto.trim()) return
    setBusy(true)
    try {
      await enviar(texto)
      setTexto('')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-8rem-env(safe-area-inset-top))] flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <button onClick={onVoltar} aria-label="Voltar" className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{c.titulo}</p>
          <p className="truncate text-[11px] text-white/40">
            {grupo ? c.rota : `Motivo: ${c.assunto ?? '—'} · ${c.rota}`}
          </p>
        </div>
        {!grupo && c.situacao !== 'encerrada' && (
          <button
            onClick={async () => {
              try {
                await encerrar()
                toast('Conversa encerrada')
                onVoltar()
              } catch (e) {
                toast((e as Error).message, 'err')
              }
            }}
            className="text-[11px] font-semibold text-white/50 underline"
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
        ) : msgs.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">Nenhuma mensagem ainda.</p>
        ) : (
          msgs.map((m) => {
            const meu = m.autor_id === meuId
            if (m.eh_bot) {
              return (
                <p key={m.id} className="mx-auto w-fit rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/40">
                  {m.corpo}
                </p>
              )
            }
            return (
              <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    meu ? 'bg-gold-500 text-gold-ink' : 'bg-white/[0.06]'
                  }`}
                >
                  {/* No grupo, todas as mensagens levam o nome de quem enviou */}
                  {(grupo || !meu) && (
                    <p className={`mb-0.5 text-[10.5px] font-semibold ${meu ? 'text-gold-ink/70' : 'text-gold-400'}`}>
                      {meu ? 'Você (motorista)' : m.autor_nome ?? 'Participante'}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.corpo}</p>
                  <p className={`mt-1 text-[10px] ${meu ? 'text-gold-ink/60' : 'text-white/30'}`}>
                    {hora(m.criado_em)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={fim} />
      </div>

      <div className="flex items-end gap-2 border-t border-white/[0.06] px-4 py-3">
        <textarea
          className="input-dark max-h-24 min-h-[44px] flex-1 resize-none py-2.5"
          placeholder={grupo ? 'Aviso para o grupo da rota…' : 'Responder…'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button
          onClick={mandar}
          disabled={busy || !texto.trim()}
          aria-label="Enviar"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500 text-gold-ink disabled:opacity-40"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

/**
 * Conversas do motorista: estudantes que escreveram direto para ele (com
 * o motivo escolhido no app), os grupos das rotas e os recados com a
 * secretaria.
 */
export function Conversas({ dados, recadosNaoLidos }: { dados: ConversasMotorista; recadosNaoLidos: number }) {
  const { conversas, loading, refresh, marcarLidaLocal } = dados
  const [aba, setAba] = useState<Aba>('alunos')
  const [aberta, setAberta] = useState<ConversaMot | null>(null)

  if (aberta) {
    return (
      <ConversaAberta
        c={aberta}
        onVoltar={() => {
          setAberta(null)
          refresh()
        }}
      />
    )
  }

  const diretas = conversas.filter((c) => c.tipo === 'direta')
  const grupos = conversas.filter((c) => c.tipo === 'grupo')
  const naoLidas = (lista: ConversaMot[]) => lista.reduce((t, c) => t + (c.nao_lidas ?? 0), 0)
  const contador: Record<Aba, number> = {
    // Sem 0028 no banco nao ha contagem: vale "esperando resposta", como antes.
    alunos: diretas.some((c) => c.nao_lidas != null)
      ? naoLidas(diretas)
      : diretas.filter((c) => c.aguardando && c.situacao !== 'encerrada').length,
    grupos: naoLidas(grupos),
    secretaria: recadosNaoLidos,
  }
  const lista = aba === 'alunos' ? diretas : grupos

  const abrir = (c: ConversaMot) => {
    marcarLidaLocal(c.id)
    setAberta(c)
  }

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">

      <div className="flex rounded-xl bg-white/5 p-1">
        {(
          [
            ['alunos', 'Alunos', UserRound],
            ['grupos', 'Grupos', Users],
            ['secretaria', 'Secretaria', Building2],
          ] as const
        ).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${
              aba === id ? 'bg-gold-500 text-gold-ink' : 'text-white/50'
            }`}
          >
            <Icone className="h-3.5 w-3.5" />
            {rotulo}
            {contador[id] > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-[#fff]">{contador[id] > 99 ? '99+' : contador[id]}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'grupos' && (
        <p className="text-[11px] text-white/40">
          Para avisar todos os alunos de uma rota, escreva no grupo dela: cada aluno recebe a notificação.
        </p>
      )}

      {aba === 'secretaria' ? (
        <div className="-mx-4 -mt-4">
          <Mensagens />
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <MessageCircle className="mb-3 h-12 w-12 text-white/10" />
          <p className="text-sm text-white/40">
            {aba === 'alunos'
              ? 'Nenhum aluno escreveu para você ainda.'
              : 'Os grupos aparecem quando há alunos alocados nas suas rotas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <button key={c.id} onClick={() => abrir(c)} className="card flex w-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500">
                {c.tipo === 'grupo' ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm ${(c.nao_lidas ?? 0) > 0 || (c.aguardando && c.tipo === 'direta') ? 'font-bold' : 'font-semibold'}`}>
                    {c.titulo}
                  </p>
                  <span className="flex-shrink-0 text-[10px] text-white/30">{quando(c.ultima_em)}</span>
                </div>
                {c.tipo === 'direta' && (
                  <p className="text-[11px] font-medium text-gold-400">
                    {c.assunto ?? 'Sem motivo'}
                    {c.situacao === 'encerrada' && <span className="text-white/30"> · encerrada</span>}
                  </p>
                )}
                <p className="truncate text-xs text-white/40">{c.ultima_msg ?? c.rota}</p>
              </div>
              {(c.nao_lidas ?? 0) > 0 ? (
                <span
                  aria-label={`${c.nao_lidas} não lida${c.nao_lidas === 1 ? '' : 's'}`}
                  className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-gold-ink"
                >
                  {c.nao_lidas! > 99 ? '99+' : c.nao_lidas}
                </span>
              ) : (
                c.aguardando && c.tipo === 'direta' && c.situacao !== 'encerrada' && (
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gold-500" />
                )
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
