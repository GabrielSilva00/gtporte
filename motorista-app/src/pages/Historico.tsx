import { useState } from 'react'
import { ArrowLeft, ChevronRight, History, Info, Smartphone, UserCheck, UserX } from 'lucide-react'
import { resumirTrecho, useDetalheViagem, useHistorico, type HistViagem, type LinhaViagem, type Trecho } from '@/hooks/useMotorista'
import { Spinner } from '@/components/Spinner'

const fmtData = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
const diaSemana = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('pt-BR', { weekday: 'long' })
}
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

type Grupo = { chave: string; titulo: string; Icone: typeof UserCheck; cls: string; linhas: LinhaViagem[]; detalhe: (l: LinhaViagem) => string | null }

function Secao({ g }: { g: Grupo }) {
  const [aberta, setAberta] = useState(g.linhas.length > 0 && g.linhas.length <= 12)
  return (
    <section className="card">
      <button onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="flex w-full items-center gap-3 text-left" disabled={g.linhas.length === 0}>
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${g.cls}`}>
          <g.Icone className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-semibold">{g.titulo}</span>
        <span className="text-lg font-extrabold">{g.linhas.length}</span>
        {g.linhas.length > 0 && <ChevronRight className={`h-4 w-4 text-white/30 transition-transform ${aberta ? 'rotate-90' : ''}`} />}
      </button>
      {aberta && g.linhas.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {g.linhas.map((l) => {
            const extra = g.detalhe(l)
            return (
              <li key={l.estudante_id} className="py-2">
                <p className="text-sm font-medium">{l.nome}</p>
                <p className="text-[11px] text-white/40">
                  {l.prontuario}
                  {extra ? ` · ${extra}` : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Quem foi, quem voltou, quem cancelou e quem confirmou no app mas nao embarcou. */
function DetalheViagem({ v, onVoltar }: { v: HistViagem; onVoltar: () => void }) {
  const { linhas, loading, erro } = useDetalheViagem(v.rota_id, v.data)
  const ida = resumirTrecho(linhas, 'ida')
  const volta = resumirTrecho(linhas, 'volta')

  const grupos = (t: Trecho): Grupo[] => {
    const r = t === 'ida' ? ida : volta
    const emb = (l: LinhaViagem) => (t === 'ida' ? l.embarque_ida_em : l.embarque_volta_em)
    const hr = (l: LinhaViagem) => (t === 'ida' ? l.hora_ida : l.hora_volta)
    const motivo = (l: LinhaViagem) => (t === 'ida' ? l.motivo_cancelamento_ida : l.motivo_cancelamento_volta)
    return [
      {
        chave: `${t}-foram`,
        titulo: t === 'ida' ? 'Foram' : 'Voltaram',
        Icone: UserCheck,
        cls: t === 'ida' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400',
        linhas: r.foram,
        detalhe: (l) => (emb(l) ? `embarcou às ${hora(emb(l))}` : hr(l) ? `presença registrada às ${hora(hr(l))}` : null),
      },
      {
        chave: `${t}-sem`,
        titulo: 'Fizeram check-in e não foram',
        Icone: Smartphone,
        cls: 'bg-amber-500/15 text-amber-400',
        linhas: r.semEmbarque,
        detalhe: (l) => {
          const c = t === 'ida' ? l.checkin_aluno_ida_em : l.checkin_aluno_volta_em
          return c ? `confirmou no app às ${hora(c)}` : null
        },
      },
      {
        chave: `${t}-canc`,
        titulo: 'Cancelaram',
        Icone: UserX,
        cls: 'bg-rose-500/15 text-rose-400',
        linhas: r.cancelaram,
        detalhe: (l) => motivo(l),
      },
    ]
  }

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-white/60">
        <ArrowLeft className="h-4 w-4" />
        Histórico
      </button>
      <div>
        <p className="text-xs font-semibold tracking-wider text-gold-500">{v.rota_codigo}</p>
        <h2 className="text-lg font-bold">{fmtData(v.data)}</h2>
        <p className="text-xs capitalize text-white/40">{diaSemana(v.data)} · {v.rota_nome}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : erro ? (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-400">{erro}</p>
      ) : (
        (['ida', 'volta'] as const).map((t) => {
          const r = t === 'ida' ? ida : volta
          return (
            <div key={t} className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">{t === 'ida' ? 'Ida' : 'Volta'}</h3>
              {!r.conferido && r.semEmbarque.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-[11px] text-white/50">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  O embarque não foi conferido no check-in nesta {t}: quem confirmou pelo app aparece como "não foi", mas pode ter ido.
                </p>
              )}
              {grupos(t).map((g) => <Secao key={g.chave} g={g} />)}
            </div>
          )
        })
      )}
    </div>
  )
}

export function Historico() {
  const { hist, loading } = useHistorico()
  const [aberta, setAberta] = useState<HistViagem | null>(null)

  if (aberta) return <DetalheViagem v={aberta} onVoltar={() => setAberta(null)} />

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <div>
        <h2 className="text-lg font-bold">Histórico de viagens</h2>
        <p className="text-xs text-white/40">Últimos 30 dias · toque num dia para ver quem foi</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : hist.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <History className="mb-3 h-12 w-12 text-white/10" />
          <p className="text-sm text-white/40">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {hist.map((h, i) => (
            <button
              key={`${h.data}|${h.rota_id}`}
              onClick={() => setAberta(h)}
              className="card flex w-full items-center gap-3 text-left anim-in active:bg-white/[0.03]"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500">
                <History className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{fmtData(h.data)}</p>
                <p className="truncate text-xs text-white/40">{h.rota_codigo} — {h.rota_nome}</p>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="text-center"><span className="block text-lg font-bold text-emerald-400">{h.total_ida}</span><span className="text-white/30">ida</span></div>
                <div className="text-center"><span className="block text-lg font-bold text-blue-400">{h.total_volta}</span><span className="text-white/30">volta</span></div>
                {h.cancelamentos > 0 && (
                  <div className="text-center"><span className="block text-lg font-bold text-rose-400">{h.cancelamentos}</span><span className="text-white/30">canc.</span></div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/20" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
