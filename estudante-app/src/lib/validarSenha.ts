/**
 * Validacao de senha do app do estudante.
 *
 * Mesmas regras de src/lib/validarSenha.ts do painel administrativo
 * (RF01 / RF20). Os dois apps sao projetos Vite separados e nao
 * compartilham modulos, por isso a regra vive duplicada — ao mudar uma,
 * mude a outra.
 *
 * Aqui as regras ficam expostas em REGRAS_SENHA para a tela de cadastro
 * poder desenhar o checklist sem reimplementar as expressoes.
 */

export interface RegraSenha {
  id: 'tamanho' | 'maiuscula' | 'numero' | 'especial'
  rotulo: string
  erro: string
  ok: (senha: string) => boolean
}

export const REGRAS_SENHA: RegraSenha[] = [
  {
    id: 'tamanho',
    rotulo: 'Ao menos 8 caracteres',
    erro: 'A senha precisa ter ao menos 8 caracteres.',
    ok: (s) => !!s && s.length >= 8,
  },
  {
    id: 'maiuscula',
    rotulo: 'Uma letra maiúscula',
    erro: 'A senha precisa conter ao menos uma letra maiúscula.',
    ok: (s) => /[A-Z]/.test(s),
  },
  {
    id: 'numero',
    rotulo: 'Um número',
    erro: 'A senha precisa conter ao menos um número.',
    ok: (s) => /[0-9]/.test(s),
  },
  {
    id: 'especial',
    rotulo: 'Um caractere especial',
    erro: 'A senha precisa conter ao menos um caractere especial.',
    ok: (s) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(s),
  },
]

export interface ResultadoValidacao {
  valida: boolean
  erros: string[]
}

export function validarSenha(senha: string): ResultadoValidacao {
  const erros = REGRAS_SENHA.filter((r) => !r.ok(senha)).map((r) => r.erro)
  return { valida: erros.length === 0, erros }
}
