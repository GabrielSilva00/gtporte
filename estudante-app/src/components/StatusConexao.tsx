import { CloudOff, RefreshCw, TriangleAlert, Wifi } from 'lucide-react'
import { useConexao } from '@/hooks/useConexao'

/**
 * Faixa de status no topo. Fica fora do caminho quando esta tudo certo:
 * so aparece se o app estiver offline, sincronizando ou se a ultima
 * requisicao falhou.
 */
export function BarraConexao() {
  const { situacao } = useConexao()
  if (situacao === 'online') return null

  const estilo = {
    offline: { cls: 'bg-err text-white', Icone: CloudOff, texto: 'Sem conexão — exibindo dados salvos' },
    sincronizando: { cls: 'bg-brand-600 text-white', Icone: RefreshCw, texto: 'Atualizando dados…' },
    erro: { cls: 'bg-warn text-white', Icone: TriangleAlert, texto: 'Falha ao atualizar. Tentando novamente…' },
  }[situacao]

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[90] flex items-center justify-center gap-2 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] font-semibold ${estilo.cls}`}>
      <estilo.Icone className={`h-3.5 w-3.5 ${situacao === 'sincronizando' ? 'animate-spin' : ''}`} />
      <span>{estilo.texto}</span>
    </div>
  )
}

/** Versao compacta, para dentro de uma tela (usada no Perfil). */
export function IndicadorConexao({ className = '' }: { className?: string }) {
  const { situacao, ultimaSync } = useConexao()

  const mapa = {
    online: { cls: 'chip-ok', Icone: Wifi, texto: 'Online' },
    sincronizando: { cls: 'chip-info', Icone: RefreshCw, texto: 'Sincronizando' },
    erro: { cls: 'chip-warn', Icone: TriangleAlert, texto: 'Desatualizado' },
    offline: { cls: 'chip-err', Icone: CloudOff, texto: 'Offline' },
  }[situacao]

  const quando = ultimaSync
    ? new Date(ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={mapa.cls}>
        <mapa.Icone className={`h-3.5 w-3.5 ${situacao === 'sincronizando' ? 'animate-spin' : ''}`} />
        {mapa.texto}
      </span>
      {quando && <span className="text-[11px] text-faint">atualizado às {quando}</span>}
    </div>
  )
}
