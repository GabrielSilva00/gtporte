import { useMemo, useState } from 'react'
import { Bus, Clock, MapPin, Search, Users, X } from 'lucide-react'
import { useAlunosPorDia, useRotas, type AlunoDoDia } from '@/hooks/useMotorista'
import { combina } from '@/lib/qr'
import { Spinner } from '@/components/Spinner'

// dia_semana no banco: 0 = domingo ... 6 = sabado (0022_alocacao_por_dia).
const DIAS = [
  { n: 1, curto: 'Seg', longo: 'segunda-feira' },
  { n: 2, curto: 'Ter', longo: 'terça-feira' },
  { n: 3, curto: 'Qua', longo: 'quarta-feira' },
  { n: 4, curto: 'Qui', longo: 'quinta-feira' },
  { n: 5, curto: 'Sex', longo: 'sexta-feira' },
  { n: 6, curto: 'Sáb', longo: 'sábado' },
]

const USO: Record<string, { rotulo: string; cls: string }> = {
  ida_volta: { rotulo: 'Ida e volta', cls: 'bg-white/5 text-white/50' },
  somente_ida: { rotulo: 'Só ida', cls: 'bg-emerald-500/15 text-emerald-400' },
  somente_volta: { rotulo: 'Só volta', cls: 'bg-blue-500/15 text-blue-400' },
}

function Aluno({ a }: { a: AlunoDoDia }) {
  const uso = USO[a.perfil_uso] ?? USO.ida_volta
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-sm font-bold text-gold-500">
        {a.nome.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{a.nome}</p>
        <p className="truncate text-xs text-white/40">
          {a.prontuario}
          {a.universidade || a.curso ? ` · ${a.universidade || a.curso}` : ''}
        </p>
      </div>
      <span className={`chip flex-shrink-0 px-2 py-0.5 text-[10px] ${uso.cls}`}>{uso.rotulo}</span>
    </li>
  )
}

/**
 * Alunos vinculados a cada rota do motorista, dia a dia. Desde 0022 a
 * alocacao pode ser por dia da semana (o aluno vai numa rota na segunda e
 * noutra na terca); quem tem alocacao "todos os dias" aparece em todos.
 */
export function Rotas() {
  const { rotas, loading: lr } = useRotas()
  const hojeDow = new Date().getDay()
  const [dia, setDia] = useState(hojeDow === 0 ? 1 : hojeDow)
  const [busca, setBusca] = useState('')
  const ids = useMemo(() => rotas.map((r) => r.rota_id), [rotas])
  const { alunos, loading } = useAlunosPorDia(ids, dia)

  const porRota = useMemo(() => {
    const filtrados = busca.trim() ? alunos.filter((a) => combina(busca, a.nome, a.prontuario)) : alunos
    const m = new Map<string, AlunoDoDia[]>()
    for (const a of filtrados) m.set(a.rota_id, [...(m.get(a.rota_id) ?? []), a])
    return m
  }, [alunos, busca])

  if (lr) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>
  if (rotas.length === 0)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <Bus className="mb-4 h-16 w-16 text-white/10" />
        <p className="text-lg font-semibold">Nenhuma rota atribuída</p>
        <p className="mt-1 text-sm text-white/40">Peça ao administrador para vincular você a uma rota.</p>
      </div>
    )

  const diaAtual = DIAS.find((d) => d.n === dia)!

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <div role="tablist" aria-label="Dia da semana" className="grid grid-cols-6 gap-1 rounded-xl bg-white/5 p-1">
        {DIAS.map((d) => {
          const sel = d.n === dia
          return (
            <button
              key={d.n}
              role="tab"
              aria-selected={sel}
              aria-label={d.longo}
              onClick={() => setDia(d.n)}
              className={`relative rounded-lg py-2 text-xs font-semibold transition-colors ${sel ? 'bg-gold-500 text-gold-ink' : 'text-white/50'}`}
            >
              {d.curto}
              {d.n === hojeDow && !sel && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-500" />}
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          className="input-dark pl-10 pr-10"
          placeholder="Buscar aluno por nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/30">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-white/40">
        {dia === hojeDow ? 'Hoje, ' : ''}
        {diaAtual.longo}: {alunos.length} aluno{alunos.length === 1 ? '' : 's'} em {rotas.length} rota{rotas.length === 1 ? '' : 's'}
      </p>

      {loading && alunos.length === 0 ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        rotas.map((r) => {
          const lista = porRota.get(r.rota_id) ?? []
          const ida = lista.filter((a) => a.perfil_uso !== 'somente_volta').length
          const volta = lista.filter((a) => a.perfil_uso !== 'somente_ida').length
          return (
            <section key={r.rota_id} className="card anim-in" aria-label={`Rota ${r.codigo}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wider text-gold-500">{r.codigo}</p>
                  <h2 className="truncate text-base font-bold">{r.nome}</h2>
                </div>
                <span className="chip flex-shrink-0 bg-gold-500/10 text-gold-500">
                  <Users className="h-3.5 w-3.5" />
                  {lista.length}/{r.capacidade_maxima}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.horario_partida?.slice(0, 5)} / {r.horario_retorno?.slice(0, 5)}</span>
                {(r.origem || r.destino) && (
                  <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{r.origem} → {r.destino}</span></span>
                )}
                <span>{ida} na ida · {volta} na volta</span>
              </div>
              {lista.length === 0 ? (
                <p className="mt-3 border-t border-white/[0.06] pt-3 text-center text-xs text-white/30">
                  {busca ? 'Nenhum aluno encontrado.' : `Nenhum aluno nesta rota na ${diaAtual.longo}.`}
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {lista.map((a) => <Aluno key={a.alocacao_id} a={a} />)}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
