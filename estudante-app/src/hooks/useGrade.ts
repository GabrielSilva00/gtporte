import { useCallback, useEffect, useState } from 'react'
import { erroMsg, supabase } from '@/lib/supabase'
import {
  diasInvalidos,
  gradeDeLinhas,
  gradeVazia,
  linhasDaGrade,
  type MapaGrade,
} from '@/components/GradeSemanal'

/**
 * Grade horaria do estudante — insumo da distribuicao automatica (RN02).
 *
 * Diferente dos dados cadastrais, a grade nao passa pela fila da
 * secretaria: ela e do proprio aluno e muda a cada semestre, e a policy
 * grade_propria ja permite que ele escreva na sua.
 */
export function useGrade(estudanteId: string | null) {
  const [grade, setGrade] = useState<MapaGrade>(gradeVazia)
  const [salva, setSalva] = useState<MapaGrade>(gradeVazia)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!estudanteId) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('grade_horaria')
      .select('dia_semana,hora_inicio,hora_fim')
      .eq('estudante_id', estudanteId)
      .order('dia_semana')

    const mapa = gradeDeLinhas(data ?? [])
    setGrade(mapa)
    setSalva(mapa)
    setLoading(false)
  }, [estudanteId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const salvar = useCallback(async () => {
    if (!estudanteId) throw new Error('Cadastro não encontrado.')

    const invalidos = diasInvalidos(grade)
    if (invalidos.length > 0) {
      throw new Error(
        `Informe início e término (com término depois do início) em: ${invalidos
          .map((d) => d.rotulo)
          .join(', ')}.`,
      )
    }

    // A grade e reescrita por inteiro: dia desmarcado deixa de existir.
    const { error: erroDelete } = await supabase
      .from('grade_horaria')
      .delete()
      .eq('estudante_id', estudanteId)
    if (erroDelete) throw new Error(erroMsg(erroDelete))

    const linhas = linhasDaGrade(grade, estudanteId)
    if (linhas.length > 0) {
      const { error } = await supabase.from('grade_horaria').insert(linhas)
      if (error) throw new Error(erroMsg(error))
    }
    await refresh()
  }, [estudanteId, grade, refresh])

  const diasPreenchidos = linhasDaGrade(grade, 'x').length
  const vazia = diasPreenchidos === 0
  const alterada = JSON.stringify(grade) !== JSON.stringify(salva)

  return { grade, setGrade, salvar, refresh, loading, vazia, diasPreenchidos, alterada }
}
