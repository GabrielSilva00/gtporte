import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Canais de contato da secretaria (bloco 10 da tabela organizacao).
 * A RLS libera leitura para qualquer autenticado justamente para o
 * estudante e o motorista terem o contato institucional.
 */
export interface Organizacao {
  nome_fantasia: string | null
  razao_social: string | null
  telefone: string | null
  email: string | null
  site: string | null
  canal_ouvidoria: string | null
  canal_sac: string | null
  canal_email: string | null
  canal_whatsapp: string | null
  horario_atendimento: string | null
  gestor_nome: string | null
  gestor_email: string | null
  gestor_telefone: string | null
}

const CAMPOS =
  'nome_fantasia,razao_social,telefone,email,site,canal_ouvidoria,canal_sac,canal_email,canal_whatsapp,horario_atendimento,gestor_nome,gestor_email,gestor_telefone'

export function useOrganizacao() {
  const [org, setOrg] = useState<Organizacao | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('organizacao').select(CAMPOS).limit(1).maybeSingle()
      if (!vivo) return
      setOrg((data as Organizacao) ?? null)
      setLoading(false)
    })()
    return () => { vivo = false }
  }, [])

  return { org, loading }
}
