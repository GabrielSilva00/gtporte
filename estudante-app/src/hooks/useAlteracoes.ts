import { useCallback, useEffect, useState } from 'react'
import { erroMsg, supabase } from '@/lib/supabase'

export type StatusAlteracao = 'pendente' | 'aprovada' | 'recusada'

/** Campos que o estudante pode pedir para alterar (espelha campo_cadastral_editavel no banco). */
export type CampoEditavel =
  | 'nome'
  | 'telefone'
  | 'email'
  | 'curso'
  | 'endereco'
  | 'data_nascimento'
  | 'universidade_id'
  | 'cidade_id'
  | 'perfil_uso'

export interface Alteracao {
  id: string
  campo: CampoEditavel
  valor_anterior: string | null
  valor_novo: string | null
  status: StatusAlteracao
  observacao: string | null
  criado_em: string
}

export const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  nome: 'Nome completo',
  telefone: 'Telefone',
  email: 'E-mail',
  curso: 'Curso',
  endereco: 'Endereço',
  data_nascimento: 'Data de nascimento',
  universidade_id: 'Universidade',
  cidade_id: 'Cidade',
  perfil_uso: 'Perfil de uso',
}

/**
 * Alteracoes cadastrais do estudante. O que ele grava nao entra direto no
 * cadastro: fica pendente ate a secretaria validar, e a tela marca o campo
 * em laranja enquanto isso.
 */
export function useAlteracoes(estudanteId: string | null) {
  const [itens, setItens] = useState<Alteracao[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!estudanteId) {
      setItens([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('alteracao_cadastral')
      .select('id,campo,valor_anterior,valor_novo,status,observacao,criado_em')
      .eq('estudante_id', estudanteId)
      .order('criado_em', { ascending: false })
      .limit(50)
    setItens((data as Alteracao[]) ?? [])
    setLoading(false)
  }, [estudanteId])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Envia {campo: valor}. O banco descarta o que nao mudou. */
  const solicitar = useCallback(
    async (campos: Partial<Record<CampoEditavel, string | null>>) => {
      const { error } = await supabase.rpc('solicitar_alteracao_cadastral', { p_campos: campos })
      if (error) throw new Error(erroMsg(error))
      await refresh()
    },
    [refresh],
  )

  const pendentes = itens.filter((a) => a.status === 'pendente')
  const recusadas = itens.filter((a) => a.status === 'recusada')

  /** Mapa campo -> alteracao pendente, para a tela marcar o campo. */
  const pendentePorCampo = new Map(pendentes.map((a) => [a.campo, a]))

  return { itens, pendentes, recusadas, pendentePorCampo, loading, refresh, solicitar }
}
