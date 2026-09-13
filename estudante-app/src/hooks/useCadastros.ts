import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Cidade {
  id: string
  nome: string
  uf: string
}

export interface Universidade {
  id: string
  nome: string
  cidade_id: string
}

/**
 * Listas de apoio dos formularios. A RLS libera select de cidade e
 * universidade para qualquer autenticado.
 */
export function useCadastros() {
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [universidades, setUniversidades] = useState<Universidade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [c, u] = await Promise.all([
        supabase.from('cidade').select('id,nome,uf').order('nome'),
        supabase.from('universidade').select('id,nome,cidade_id').eq('ativa', true).order('nome'),
      ])
      if (!vivo) return
      setCidades((c.data as Cidade[]) ?? [])
      setUniversidades((u.data as Universidade[]) ?? [])
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  return { cidades, universidades, loading }
}
