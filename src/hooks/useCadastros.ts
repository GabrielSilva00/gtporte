import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Cidade, Motorista, OcupacaoRota, Rota, Universidade, Veiculo } from '../lib/types'

/** Selects reutilizados pelas telas — evita duplicar o embed do PostgREST. */
const SELECT_ROTA = `
  *,
  origem:cidade_origem_id (id, nome),
  destino:cidade_destino_id (id, nome),
  veiculo:veiculo_id (id, placa, modelo, capacidade_maxima),
  motorista:motorista_id (id, nome),
  universidades:rota_universidade (universidade:universidade_id (id, nome))
`

export function useCidades() {
  return useQuery({
    queryKey: ['cidades'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cidade').select('*').order('nome')
      if (error) throw error
      return data as Cidade[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useUniversidades() {
  return useQuery({
    queryKey: ['universidades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('universidade')
        .select('*, cidade:cidade_id (id, nome, uf)')
        .order('nome')
      if (error) throw error
      return data as Universidade[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useVeiculos() {
  return useQuery({
    queryKey: ['veiculos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('veiculo').select('*').order('placa')
      if (error) throw error
      return data as Veiculo[]
    },
  })
}

export function useMotoristas() {
  return useQuery({
    queryKey: ['motoristas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('motorista').select('*').order('nome')
      if (error) throw error
      return data as Motorista[]
    },
  })
}

export function useRotas() {
  return useQuery({
    queryKey: ['rotas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rota').select(SELECT_ROTA).order('codigo')
      if (error) throw error
      return data as unknown as Rota[]
    },
  })
}

/** View vw_ocupacao_rota — base do dashboard, da alocação e dos relatórios. */
export function useOcupacaoRotas() {
  return useQuery({
    queryKey: ['ocupacao-rotas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_ocupacao_rota').select('*').order('codigo')
      if (error) throw error
      return data as OcupacaoRota[]
    },
  })
}

/**
 * Ocupação de uma data específica, via RPC ocupacao_por_data.
 * A view vw_ocupacao_rota é sempre "ao vivo" e não recorta por data — este
 * hook é o que permite comparar hoje com o dia anterior no painel.
 */
export function useOcupacaoPorData(data: string) {
  return useQuery({
    queryKey: ['ocupacao-por-data', data],
    queryFn: async () => {
      const { data: linhas, error } = await supabase.rpc('ocupacao_por_data', { p_data: data })
      if (error) throw error
      return (linhas ?? []) as OcupacaoRota[]
    },
  })
}
