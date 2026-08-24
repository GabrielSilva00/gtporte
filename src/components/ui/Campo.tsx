export type TipoCampo =
  | 'texto'
  | 'data'
  | 'numero'
  | 'moeda'
  | 'booleano'
  | 'select'
  | 'textarea'
  | 'cep'
  | 'cpf'
  | 'cnpj'
  | 'telefone'
  | 'email'

export interface DefinicaoCampo {
  chave: string
  rotulo: string
  tipo?: TipoCampo
  opcoes?: { valor: string; rotulo: string }[]
  ajuda?: string
  placeholder?: string
  /** Quantas colunas o campo ocupa no grid de 2 colunas. */
  colSpan?: 1 | 2
  obrigatorio?: boolean
}

interface Props {
  campo: DefinicaoCampo
  valor: unknown
  onMudar: (chave: string, valor: unknown) => void
  somenteLeitura?: boolean
}

/** Máscaras leves: formatam enquanto digita, sem travar a edição. */
const MASCARAS: Partial<Record<TipoCampo, (v: string) => string>> = {
  cep: (v) => digitos(v, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
  cpf: (v) =>
    digitos(v, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'),
  cnpj: (v) =>
    digitos(v, 14)
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2'),
  telefone: (v) =>
    digitos(v, 11)
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4,5})(\d{4})$/, '$1-$2'),
}

function digitos(valor: string, max: number) {
  return valor.replace(/\D/g, '').slice(0, max)
}

/**
 * Renderiza um campo a partir da sua definição. Existe para que telas com
 * dezenas de campos (motorista, organização) sejam descritas como dados
 * em vez de JSX repetido.
 */
export function Campo({ campo, valor, onMudar, somenteLeitura }: Props) {
  const tipo = campo.tipo ?? 'texto'
  const span = campo.colSpan === 2 ? 'sm:col-span-2' : ''

  if (tipo === 'booleano') {
    return (
      <label className={`flex items-start gap-2.5 rounded-field border border-edge p-3 ${span}`}>
        <input
          type="checkbox"
          checked={valor === true}
          disabled={somenteLeitura}
          onChange={(e) => onMudar(campo.chave, e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-primary"
        />
        <span>
          <span className="block text-[13px] text-ink">{campo.rotulo}</span>
          {campo.ajuda && <span className="mt-0.5 block text-[11.5px] text-muted">{campo.ajuda}</span>}
        </span>
      </label>
    )
  }

  return (
    <label className={span}>
      <span className="field-label">
        {campo.rotulo}
        {campo.obrigatorio && <span className="ml-0.5 text-accent">*</span>}
      </span>
      {controle(tipo, campo, valor, onMudar, somenteLeitura)}
      {campo.ajuda && <span className="mt-1 block text-[11.5px] text-muted">{campo.ajuda}</span>}
    </label>
  )
}

function controle(
  tipo: TipoCampo,
  campo: DefinicaoCampo,
  valor: unknown,
  onMudar: (chave: string, valor: unknown) => void,
  somenteLeitura?: boolean,
) {
  const texto = valor === null || valor === undefined ? '' : String(valor)

  if (tipo === 'select') {
    return (
      <select
        className="field"
        value={texto}
        disabled={somenteLeitura}
        onChange={(e) => onMudar(campo.chave, e.target.value || null)}
      >
        <option value="">Não informado</option>
        {(campo.opcoes ?? []).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    )
  }

  if (tipo === 'textarea') {
    return (
      <textarea
        className="field resize-y"
        rows={3}
        value={texto}
        disabled={somenteLeitura}
        placeholder={campo.placeholder}
        onChange={(e) => onMudar(campo.chave, e.target.value || null)}
      />
    )
  }

  const mascara = MASCARAS[tipo]
  const htmlType = tipo === 'data' ? 'date' : tipo === 'numero' || tipo === 'moeda' ? 'number' : tipo === 'email' ? 'email' : 'text'

  return (
    <input
      className="field"
      type={htmlType}
      step={tipo === 'moeda' ? '0.01' : undefined}
      inputMode={mascara ? 'numeric' : undefined}
      value={texto}
      disabled={somenteLeitura}
      placeholder={campo.placeholder}
      onChange={(e) => {
        const bruto = mascara ? mascara(e.target.value) : e.target.value
        if (htmlType === 'number') {
          onMudar(campo.chave, bruto === '' ? null : Number(bruto))
        } else {
          onMudar(campo.chave, bruto === '' ? null : bruto)
        }
      }}
    />
  )
}

/** Grid padrão de duas colunas para blocos de campos. */
export function GradeCampos({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>
}
