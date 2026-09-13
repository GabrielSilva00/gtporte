import { useSyncExternalStore } from 'react'
import { inscrever, lerEstado } from '@/lib/conexao'

export type SituacaoConexao = 'offline' | 'sincronizando' | 'erro' | 'online'

export function useConexao() {
  const estado = useSyncExternalStore(
    (f) => { const cancelar = inscrever(f); return () => { cancelar() } },
    lerEstado,
    lerEstado,
  )

  const situacao: SituacaoConexao = !estado.online
    ? 'offline'
    : estado.pendentes > 0
      ? 'sincronizando'
      : estado.falhou
        ? 'erro'
        : 'online'

  return { ...estado, situacao }
}
