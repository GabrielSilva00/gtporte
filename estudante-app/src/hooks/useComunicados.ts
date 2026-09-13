import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Prioridade = 'normal' | 'importante' | 'urgente'

export interface Comunicado {
  id: string
  titulo: string
  corpo: string
  prioridade: Prioridade
  alcance: 'todos' | 'rota' | 'universidade'
  publicado_em: string
  expira_em: string | null
}

/**
 * Comunicados da secretaria que alcancam este estudante. O recorte por
 * alcance (todos / rota / universidade) e feito em meus_comunicados().
 */
export function useComunicados() {
  const [itens, setItens] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc('meus_comunicados')
    setItens((data as Comunicado[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { comunicados: itens, loading, refresh }
}
