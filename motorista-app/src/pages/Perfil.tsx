import { useState } from 'react'
import type { ReactNode } from 'react'
import { Bus, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Flag, History, LogOut, MapPin, Palette, Shield, Smartphone, Users } from 'lucide-react'
import { useParadas, useRotas, ROTULO_SIT, COR_SIT, type RotaMot } from '@/hooks/useMotorista'
import type { Perfil as P } from '@/hooks/useAuth'
import type { SubPerfil } from '@/lib/navegacao'
import { Historico } from '@/pages/Historico'
import { Documentos } from '@/pages/Documentos'
import { Spinner } from '@/components/Spinner'
import { SeletorTema } from '@/components/SeletorTema'

const STATUS_ROTA: Record<string, string> = { ativa: 'Ativa', lotada: 'Lotada', revisao: 'Em revisão', inativa: 'Inativa' }

function Linha({ Icone, rotulo, valor }: { Icone: typeof Bus; rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500/70" />
      <span className="w-24 flex-shrink-0 text-xs text-white/40">{rotulo}</span>
      <span className="min-w-0 flex-1 text-sm font-medium">{valor}</span>
    </div>
  )
}

/** Tudo sobre uma rota do motorista: dados, onibus, horarios e paradas. */
function CartaoRota({ r, inicialAberto }: { r: RotaMot; inicialAberto: boolean }) {
  const [aberto, setAberto] = useState(inicialAberto)
  const { paradas, loading } = useParadas(aberto ? r.rota_id : null)
  const vagas = Math.max(0, r.capacidade_maxima - r.passageiros)
  const ocupacao = r.capacidade_maxima > 0 ? Math.min(100, Math.round((r.passageiros / r.capacidade_maxima) * 100)) : 0

  return (
    <section className="card anim-in">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-gold-500">{r.codigo}</p>
          <p className="truncate text-base font-bold">{r.nome}</p>
        </div>
        <span className="flex flex-shrink-0 items-center gap-2">
          <span className={`chip text-[10px] ${COR_SIT[r.situacao_operacional]}`}>{ROTULO_SIT[r.situacao_operacional]}</span>
          <ChevronDown className={`h-4 w-4 text-white/30 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {aberto && (
        <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          <Linha Icone={MapPin} rotulo="Trajeto" valor={`${r.origem ?? '—'} → ${r.destino ?? '—'}`} />
          <Linha Icone={Clock} rotulo="Partida" valor={r.horario_partida?.slice(0, 5) ?? '—'} />
          <Linha Icone={CalendarClock} rotulo="Retorno" valor={r.horario_retorno?.slice(0, 5) ?? '—'} />
          <Linha Icone={Flag} rotulo="Status" valor={STATUS_ROTA[r.status] ?? r.status} />
          <Linha Icone={Bus} rotulo="Ônibus" valor={<><span className="font-bold tracking-wider">{r.placa}</span><span className="text-white/50"> · {r.modelo}</span></>} />
          <Linha
            Icone={Users}
            rotulo="Lotação"
            valor={
              <span className="block">
                {r.passageiros} de {r.capacidade_maxima} lugares · {vagas} vaga{vagas === 1 ? '' : 's'}
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <span className={`block h-full rounded-full ${ocupacao >= 100 ? 'bg-rose-500' : 'bg-gold-500'}`} style={{ width: `${ocupacao}%` }} />
                </span>
              </span>
            }
          />
          <div className="py-2.5">
            <p className="mb-2 flex items-center gap-3 text-xs text-white/40"><MapPin className="h-4 w-4 text-gold-500/70" />Paradas</p>
            {loading ? (
              <div className="flex justify-center py-3"><Spinner className="h-4 w-4" /></div>
            ) : paradas.length === 0 ? (
              <p className="pl-7 text-xs text-white/30">Nenhuma parada cadastrada.</p>
            ) : (
              <ol className="space-y-1.5 pl-7">
                {paradas.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2 text-sm">
                    <span className="w-5 flex-shrink-0 text-xs font-bold text-gold-500">{p.ordem}</span>
                    <span className="min-w-0 flex-1">
                      {p.nome}
                      {p.universidade && <span className="text-white/40"> · {p.universidade}</span>}
                    </span>
                    {p.minutos_partida != null && <span className="flex-shrink-0 text-[11px] text-white/40">+{p.minutos_partida} min</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function Perfil({ perfil, onLogout, sub, onSub }: { perfil: P; onLogout: () => void; sub: SubPerfil; onSub: (s: SubPerfil) => void }) {
  const { rotas, loading } = useRotas()

  if (sub)
    return (
      <div>
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-2 py-2">
          <button onClick={() => onSub(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-white/60 active:bg-white/5">
            <ChevronLeft className="h-5 w-5" />Perfil
          </button>
        </div>
        {sub === 'historico' ? <Historico /> : <Documentos />}
      </div>
    )

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <div className="card flex items-center gap-4 anim-in">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-2xl font-bold text-gold-500">{perfil.nome.charAt(0)}</div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{perfil.nome}</h2>
          <div className="mt-0.5 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-gold-500" /><span className="text-xs font-medium uppercase tracking-wider text-gold-500">Motorista</span></div>
          {perfil.login && <p className="mt-0.5 text-xs text-white/30">Login: {perfil.login}</p>}
        </div>
      </div>

      <h3 className="text-sm font-semibold text-white/50">{rotas.length > 1 ? 'Minhas rotas' : 'Minha rota'}</h3>
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : rotas.length === 0 ? (
        <p className="py-4 text-center text-sm text-white/30">Nenhuma rota atribuída</p>
      ) : (
        <div className="space-y-2">{rotas.map((r, i) => <CartaoRota key={r.rota_id} r={r} inicialAberto={i === 0} />)}</div>
      )}

      <div className="space-y-2">
        {([['historico', History, 'Histórico de viagens'], ['documentos', FileText, 'Meus documentos']] as const).map(([id, Icone, rotulo]) => (
          <button key={id} onClick={() => onSub(id)} className="card flex w-full items-center gap-3 text-left active:bg-white/[0.03]">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/10 text-gold-500"><Icone className="h-5 w-5" /></div>
            <span className="flex-1 text-sm font-semibold">{rotulo}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/20" />
          </button>
        ))}
      </div>

      <div className="card space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-gold-500" />Cor do aplicativo</p>
        <SeletorTema />
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-3 text-sm text-white/40"><Smartphone className="h-4 w-4" /><span>GTPORTE Motorista v1.1</span></div>
        <p className="text-[11px] text-white/30">Instale na tela inicial do celular para abrir mais rápido e usar sem internet.</p>
      </div>

      <button onClick={onLogout} className="btn-red flex items-center justify-center gap-2"><LogOut className="h-4 w-4" />Sair da conta</button>
    </div>
  )
}
