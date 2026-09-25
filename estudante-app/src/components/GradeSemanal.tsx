/**
 * Horario de aulas de segunda a sabado — insumo da distribuicao automatica
 * de rotas (RN02).
 *
 * A logica (gradeVazia, gradeDeLinhas, linhasDaGrade, diasInvalidos) e a
 * mesma de src/components/GradeSemanal.tsx do painel administrativo, para
 * que as duas telas gravem exatamente o mesmo formato em grade_horaria.
 * O layout aqui e proprio: uma linha por dia, pensada para o celular.
 */

export const DIAS_SEMANA = [
  { numero: 1, rotulo: 'Segunda', curto: 'Seg' },
  { numero: 2, rotulo: 'Terça', curto: 'Ter' },
  { numero: 3, rotulo: 'Quarta', curto: 'Qua' },
  { numero: 4, rotulo: 'Quinta', curto: 'Qui' },
  { numero: 5, rotulo: 'Sexta', curto: 'Sex' },
  { numero: 6, rotulo: 'Sábado', curto: 'Sáb' },
]

export interface DiaGrade {
  ativo: boolean
  inicio: string
  fim: string
}

export type MapaGrade = Record<number, DiaGrade>

export function gradeVazia(): MapaGrade {
  return Object.fromEntries(
    DIAS_SEMANA.map((d) => [d.numero, { ativo: false, inicio: '', fim: '' }]),
  ) as MapaGrade
}

export function gradeDeLinhas(
  linhas: { dia_semana: number; hora_inicio: string; hora_fim: string }[],
): MapaGrade {
  return Object.fromEntries(
    DIAS_SEMANA.map((d) => {
      const linha = linhas.find((g) => g.dia_semana === d.numero)
      return [
        d.numero,
        {
          ativo: !!linha,
          inicio: linha?.hora_inicio?.slice(0, 5) ?? '',
          fim: linha?.hora_fim?.slice(0, 5) ?? '',
        },
      ]
    }),
  ) as MapaGrade
}

export function linhasDaGrade(grade: MapaGrade, estudanteId: string) {
  return DIAS_SEMANA.filter((d) => {
    const g = grade[d.numero]
    return g?.ativo && g.inicio && g.fim
  }).map((d) => ({
    estudante_id: estudanteId,
    dia_semana: d.numero,
    hora_inicio: grade[d.numero].inicio,
    hora_fim: grade[d.numero].fim,
  }))
}

/** Dias marcados com horario incompleto ou termino antes do inicio. */
export function diasInvalidos(grade: MapaGrade) {
  return DIAS_SEMANA.filter((d) => {
    const g = grade[d.numero]
    if (!g?.ativo) return false
    return !g.inicio || !g.fim || g.fim <= g.inicio
  })
}

export function GradeSemanal({
  grade,
  onChange,
  desabilitado,
  pendentes = [],
  vigente,
}: {
  grade: MapaGrade
  onChange: (grade: MapaGrade) => void
  desabilitado?: boolean
  /** Dias alterados que aguardam validacao da secretaria: ficam em laranja. */
  pendentes?: number[]
  /** Grade em vigor, para mostrar o valor anterior de um dia pendente. */
  vigente?: MapaGrade
}) {
  const mudar = (dia: number, campo: keyof DiaGrade, valor: boolean | string) =>
    onChange({ ...grade, [dia]: { ...grade[dia], [campo]: valor } })

  return (
    <div className="flex flex-col gap-2">
      {DIAS_SEMANA.map((d) => {
        const g = grade[d.numero] ?? { ativo: false, inicio: '', fim: '' }
        const invalido = g.ativo && !!g.inicio && !!g.fim && g.fim <= g.inicio
        const pendente = pendentes.includes(d.numero)
        const antes = vigente?.[d.numero]

        return (
          <div
            key={d.numero}
            className={`rounded-xl border p-3 transition-colors ${
              pendente
                ? 'border-warn/60 bg-warn/10'
                : g.ativo
                  ? 'border-brand-500/40 bg-brand-500/5'
                  : 'border-line/60 bg-raised/40'
            }`}
          >
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={g.ativo}
                disabled={desabilitado}
                onChange={(e) => mudar(d.numero, 'ativo', e.target.checked)}
                className="h-5 w-5 rounded accent-[rgb(var(--c-brand))]"
              />
              <span
                className={`text-sm font-semibold ${pendente ? 'text-warn' : g.ativo ? '' : 'text-muted'}`}
              >
                {d.rotulo}
              </span>
              {pendente && (
                <span className="chip-warn ml-auto px-2 py-0.5 text-[10.5px]">
                  Aguardando validação
                </span>
              )}
            </label>

            {pendente && antes && (
              <p className="mt-1.5 pl-8 text-[11px] text-warn">
                Antes:{' '}
                {antes.ativo && antes.inicio ? `${antes.inicio} – ${antes.fim}` : 'sem aula'}
                {!g.ativo && ' · agora: sem aula'}
              </p>
            )}

            {g.ativo && (
              <div className="mt-3 flex items-center gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-[11px] text-muted">Início</span>
                  <input
                    type="time"
                    value={g.inicio}
                    disabled={desabilitado}
                    onChange={(e) => mudar(d.numero, 'inicio', e.target.value)}
                    className={`field py-2.5 ${pendente ? 'border-warn/60 text-warn' : ''}`}
                  />
                </label>
                <span className="mt-5 text-faint">—</span>
                <label className="flex-1">
                  <span className="mb-1 block text-[11px] text-muted">Término</span>
                  <input
                    type="time"
                    value={g.fim}
                    disabled={desabilitado}
                    onChange={(e) => mudar(d.numero, 'fim', e.target.value)}
                    className={`field py-2.5 ${pendente ? 'border-warn/60 text-warn' : ''}`}
                  />
                </label>
              </div>
            )}

            {invalido && (
              <p className="mt-2 text-[11px] text-err">O término precisa ser depois do início.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
