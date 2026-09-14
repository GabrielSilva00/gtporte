import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface RotaDoDia {
  dia_semana: number
  alocacao_id: string | null
  situacao: 'alocado' | 'fila_espera' | 'sem_rota' | null
  motivo: string | null
  rota_id: string | null
  codigo: string | null
  nome: string | null
  horario_partida: string | null
  horario_retorno: string | null
  situacao_operacional: 'aguardando' | 'em_rota' | 'concluida' | null
  origem: string | null
  destino: string | null
  motorista: string | null
  motorista_telefone: string | null
  veiculo: string | null
  hora_inicio_aula: string | null
  hora_fim_aula: string | null
  eh_hoje: boolean
}

export const NOME_DIA: Record<number, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
}

/**
 * As rotas do estudante ao longo da semana. Desde a migration 0022 a
 * alocacao e por dia: cada dia pode cair em uma rota diferente, conforme
 * o horario de aula daquele dia.
 */
export function useRotasSemana() {
  const [dias, setDias] = useState<RotaDoDia[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc('minhas_rotas_semana')
    setDias((data as RotaDoDia[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const hoje = dias.find((d) => d.eh_hoje) ?? null
  const comAula = dias.filter((d) => d.hora_inicio_aula !== null)
  const comRota = dias.filter((d) => d.rota_id !== null)

  return { dias, hoje, comAula, comRota, loading, refresh }
}
