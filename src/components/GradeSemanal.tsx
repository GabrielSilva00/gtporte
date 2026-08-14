import { DIAS_SEMANA, type DiaGrade } from '../lib/format'
import type { GradeHoraria } from '../lib/types'

export type MapaGrade = Record<number, DiaGrade>

/** Estado inicial: nenhum dia marcado, de segunda a sábado. */
export function gradeVazia(): MapaGrade {
  return Object.fromEntries(
    DIAS_SEMANA.map((d) => [d.numero, { ativo: false, inicio: '', fim: '' }]),
  ) as MapaGrade
}

/** Converte as linhas de grade_horaria do banco no estado do formulário. */
export function gradeDeLinhas(linhas: Pick<GradeHoraria, 'dia_semana' | 'hora_inicio' | 'hora_fim'>[]): MapaGrade {
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

/** Linhas prontas para gravar em grade_horaria — só os dias preenchidos. */
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

/** Dias marcados com horário incompleto ou término antes do início. */
export function diasInvalidos(grade: MapaGrade) {
  return DIAS_SEMANA.filter((d) => {
    const g = grade[d.numero]
    if (!g?.ativo) return false
    return !g.inicio || !g.fim || g.fim <= g.inicio
  })
}

/**
 * Horário de aulas de segunda a sábado — insumo da distribuição automática
 * (RN02). Compartilhado entre o cadastro administrativo e o painel do
 * estudante para que as duas telas gravem exatamente a mesma coisa.
 */
export function GradeSemanal({
  grade,
  onChange,
  desabilitado,
}: {
  grade: MapaGrade
  onChange: (grade: MapaGrade) => void
  desabilitado?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {DIAS_SEMANA.map((d) => {
        const g = grade[d.numero] ?? { ativo: false, inicio: '', fim: '' }
        return (
          <div
            key={d.numero}
            className={`grid grid-cols-[104px_1fr_1fr] items-center gap-2 rounded-field border px-3 py-2 transition-colors ${
              g.ativo ? 'border-primary/30 bg-panel' : 'border-edge'
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium">
              <input
                type="checkbox"
                checked={g.ativo}
                disabled={desabilitado}
                onChange={(e) =>
                  onChange({ ...grade, [d.numero]: { ...g, ativo: e.target.checked } })
                }
                className="h-3.5 w-3.5 accent-[#1F3A2E]"
              />
              {d.rotulo}
            </label>
            <input
              type="time"
              aria-label={`Início das aulas de ${d.rotulo}`}
              value={g.inicio}
              disabled={desabilitado || !g.ativo}
              onChange={(e) => onChange({ ...grade, [d.numero]: { ...g, inicio: e.target.value } })}
              className="field py-1.5 text-[12.5px] disabled:opacity-40"
            />
            <input
              type="time"
              aria-label={`Término das aulas de ${d.rotulo}`}
              value={g.fim}
              disabled={desabilitado || !g.ativo}
              onChange={(e) => onChange({ ...grade, [d.numero]: { ...g, fim: e.target.value } })}
              className="field py-1.5 text-[12.5px] disabled:opacity-40"
            />
          </div>
        )
      })}
    </div>
  )
}
