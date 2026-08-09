import type { EstiloBadge } from '../../lib/format'

interface Props {
  estilo: EstiloBadge
  mono?: boolean
}

/** Badge em formato pill, como no protótipo. */
export function Badge({ estilo, mono }: Props) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] ${
        mono ? 'font-mono text-[10.5px] tracking-[0.04em]' : ''
      }`}
      style={{ background: estilo.bg, color: estilo.fg }}
    >
      {estilo.rotulo}
    </span>
  )
}

/** Ponto colorido + texto, usado na coluna Status de Funcionários. */
export function StatusPonto({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  )
}
