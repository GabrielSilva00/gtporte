import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { SinoNotificacoes } from '@/components/SinoNotificacoes'
import { useConexao } from '@/hooks/useConexao'
import type { Destino } from '@/lib/navegacao'

/**
 * Faixa de conexao sob o titulo. Some quando esta tudo certo; sem rede,
 * avisa quantos registros estao guardados esperando envio.
 */
function FaixaConexao({ naFila }: { naFila: number }) {
  const { situacao } = useConexao()
  if (situacao === 'online' && naFila === 0) return null
  if (situacao === 'sincronizando' && naFila === 0) return null

  const guardados = naFila > 0 ? ` · ${naFila} registro${naFila === 1 ? '' : 's'} guardado${naFila === 1 ? '' : 's'}` : ''
  const estilo =
    situacao === 'offline'
      ? { cls: 'bg-rose-500/15 text-rose-400', Icone: CloudOff, texto: `Sem internet${guardados}` }
      : naFila > 0
        ? { cls: 'bg-gold-500/15 text-gold-500', Icone: RefreshCw, texto: `Enviando${guardados}` }
        : { cls: 'bg-amber-500/15 text-amber-400', Icone: TriangleAlert, texto: 'Falha ao atualizar. Tentando de novo…' }

  return (
    <div role="status" className={`flex items-center justify-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold ${estilo.cls}`}>
      <estilo.Icone className={`h-3.5 w-3.5 ${naFila > 0 && situacao !== 'offline' ? 'animate-spin' : ''}`} />
      {estilo.texto}
    </div>
  )
}

/** Cabecalho fixo de todas as abas: titulo da tela e sino de notificacoes. */
export function Cabecalho({ titulo, naFila, onIr }: { titulo: string; naFila: number; onIr: (d: Destino) => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-navy-900/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-500">GTPORTE Motorista</p>
          <h1 className="truncate text-base font-bold leading-tight">{titulo}</h1>
        </div>
        <SinoNotificacoes onIr={onIr} />
      </div>
      <FaixaConexao naFila={naFila} />
    </header>
  )
}
