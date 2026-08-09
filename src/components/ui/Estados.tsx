import { IconeErro } from '../icons'

/** Skeleton de carregamento no formato de tabela. */
export function CarregandoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="card divide-y divide-line">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-[18px] py-4">
          <div className="h-[30px] w-[30px] animate-pulse rounded-full bg-line" />
          <div className="h-3 flex-1 animate-pulse rounded bg-line" />
          <div className="h-3 w-24 animate-pulse rounded bg-line" />
          <div className="h-3 w-16 animate-pulse rounded bg-line" />
        </div>
      ))}
    </div>
  )
}

export function CarregandoCards({ itens = 6, altura = 150 }: { itens?: number; altura?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: itens }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-card bg-line" style={{ height: altura }} />
      ))}
    </div>
  )
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-[14px] font-medium">{titulo}</div>
      {descricao && <div className="mt-1.5 max-w-md text-[12.5px] text-muted">{descricao}</div>}
    </div>
  )
}

export function ErroCarregamento({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-danger/30 bg-bg-danger px-4 py-4">
      <span className="mt-0.5 shrink-0 text-danger">
        <IconeErro size={16} />
      </span>
      <div>
        <div className="text-[13px] font-medium text-danger">Não foi possível carregar os dados</div>
        <div className="mt-1 text-[12px] text-muted">{mensagem}</div>
      </div>
    </div>
  )
}
