import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface SituacaoAcesso {
  tem_cadastro: boolean
  status_documental: 'pendente' | 'aprovado' | 'rejeitado' | null
  documentos_enviados: number
  tem_rota: boolean
  acesso_liberado: boolean
}

const INICIAL: SituacaoAcesso = {
  tem_cadastro: false,
  status_documental: null,
  documentos_enviados: 0,
  tem_rota: false,
  acesso_liberado: false,
}

/**
 * O que o estudante pode acessar agora. Enquanto a secretaria nao aprova
 * a documentacao, as telas que dependem de rota ficam bloqueadas — o
 * cadastro pode ser concluido com um documento so, entao ate a validacao
 * o acesso e parcial.
 */
export function useAcesso(estudanteId: string | null) {
  const [situacao, setSituacao] = useState<SituacaoAcesso>(INICIAL)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!estudanteId) {
      setSituacao(INICIAL)
      setLoading(false)
      return
    }
    const { data } = await supabase.rpc('minha_situacao_acesso')
    const linha = Array.isArray(data) ? data[0] : data
    setSituacao((linha as SituacaoAcesso) ?? INICIAL)
    setLoading(false)
  }, [estudanteId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { situacao, loading, refresh }
}
