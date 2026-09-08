/**
 * Validação de senha para criação de contas no GTporte.
 * Regras derivadas do RF01 (cadastro de estudante) e RF20 (cadastro de funcionário):
 *  - Mínimo de 8 caracteres
 *  - Pelo menos uma letra maiúscula
 *  - Pelo menos um número
 *  - Pelo menos um caractere especial (!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`)
 */

export interface ResultadoValidacao {
  valida: boolean
  erros: string[]
}

export function validarSenha(senha: string): ResultadoValidacao {
  const erros: string[] = []

  if (!senha || senha.length < 8) {
    erros.push('A senha precisa ter ao menos 8 caracteres.')
  }

  if (!/[A-Z]/.test(senha)) {
    erros.push('A senha precisa conter ao menos uma letra maiúscula.')
  }

  if (!/[0-9]/.test(senha)) {
    erros.push('A senha precisa conter ao menos um número.')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(senha)) {
    erros.push('A senha precisa conter ao menos um caractere especial.')
  }

  return { valida: erros.length === 0, erros }
}
