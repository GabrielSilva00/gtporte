import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { RotaMotorista } from '../lib/types'

/**
 * RF12 — rotas sob responsabilidade do motorista logado.
 * A view usa security_invoker, então a RLS já limita ao próprio motorista
 * (RN08); o filtro explícito evita depender só disso.
 */
export function useMinhasRotas() {
  const { motoristaId } = useAuth()

  return useQuery({
    queryKey: ['minhas-rotas-motorista', motoristaId],
    enabled: !!motoristaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_minhas_rotas_motorista')
        .select('*')
        .eq('motorista_id', motoristaId!)
        .order('horario_partida')
      if (error) throw error
      return data as RotaMotorista[]
    },
  })
}
