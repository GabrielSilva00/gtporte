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
 * A grade define em que rota o estudante cabe, entao a alteracao nao
 * entra direto: fica pendente ate a secretaria validar, como os demais
 * dados cadastrais. O que a tela mostra e a grade vigente; o que foi
 * proposto aparece como pendencia.
 */
export function useGrade(estudanteId: string | null) {
  const [grade, setGrade] = useState<MapaGrade>(gradeVazia)
  const [salva, setSalva] = useState<MapaGrade>(gradeVazia)
  const [pendente, setPendente] = useState<{ id: string; criado_em: string } | null>(null)
  const [recusa, setRecusa] = useState<string | null>(null)
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

    const { data: alt } = await supabase
      .from('alteracao_grade')
      .select('id,status,observacao,criado_em')
      .eq('estudante_id', estudanteId)
      .order('criado_em', { ascending: false })
      .limit(1)
    const ultima = alt?.[0] ?? null
    setPendente(ultima && ultima.status === 'pendente' ? ultima : null)
    setRecusa(ultima && ultima.status === 'recusada' ? (ultima.observacao ?? 'Sem motivo informado.') : null)

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

    // Envia a grade inteira proposta; quem aplica em grade_horaria e a
    // secretaria, ao aprovar (revisar_alteracao_grade).
    const linhas = linhasDaGrade(grade, estudanteId).map((l) => ({
      dia_semana: l.dia_semana,
      hora_inicio: l.hora_inicio,
      hora_fim: l.hora_fim,
    }))
    const { error } = await supabase.rpc('solicitar_alteracao_grade', { p_grade: linhas })
    if (error) throw new Error(erroMsg(error))
    await refresh()
  }, [estudanteId, grade, refresh])

  const diasPreenchidos = linhasDaGrade(grade, 'x').length
  const vazia = diasPreenchidos === 0
  const alterada = JSON.stringify(grade) !== JSON.stringify(salva)

  return { grade, setGrade, salvar, refresh, loading, vazia, diasPreenchidos, alterada, pendente, recusa }
}
