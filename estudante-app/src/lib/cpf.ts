/**
 * CPF: mascara e validacao pelos digitos verificadores.
 *
 * A coluna `cpf` de `estudante` e `not null unique`, entao um valor
 * digitado errado vira um registro que ocupa o numero de outra pessoa e
 * so aparece como erro de chave duplicada bem mais tarde.
 */

/** Aplica 000.000.000-00 conforme o usuario digita. */
export function mascaraCPF(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * Validacao oficial: 11 digitos, nao todos iguais, e os dois digitos
 * verificadores conferem. Rejeita 000.000.000-00 e 111.111.111-11, que
 * passam na conta mas nao existem.
 */
export function cpfValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  const digito = (ate: number) => {
    let soma = 0
    let peso = ate + 1
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * peso--
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}
