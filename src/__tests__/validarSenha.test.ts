import { validarSenha, ResultadoValidacao } from '../lib/validarSenha'

// ============================================================
//  SUITE DE TESTES — validarSenha
//  Projeto: GTporte — Gestão de Transporte Universitário
//  Requisitos: RF01 (cadastro estudante), RF20 (cadastro funcionário)
// ============================================================

let total = 0
let passou = 0
let falhou = 0
const resultados: { nome: string; status: 'PASSOU' | 'FALHOU'; detalhe?: string }[] = []

function teste(nome: string, fn: () => void) {
  total++
  try {
    fn()
    passou++
    resultados.push({ nome, status: 'PASSOU' })
  } catch (e) {
    falhou++
    resultados.push({ nome, status: 'FALHOU', detalhe: (e as Error).message })
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function assertValida(r: ResultadoValidacao) {
  assert(r.valida === true, `Esperava valida=true, recebeu valida=false. Erros: ${r.erros.join('; ')}`)
  assert(r.erros.length === 0, `Esperava 0 erros, recebeu ${r.erros.length}: ${r.erros.join('; ')}`)
}

function assertInvalida(r: ResultadoValidacao, qtdErrosMin = 1) {
  assert(r.valida === false, 'Esperava valida=false, recebeu valida=true')
  assert(r.erros.length >= qtdErrosMin, `Esperava ao menos ${qtdErrosMin} erro(s), recebeu ${r.erros.length}`)
}

function assertContemErro(r: ResultadoValidacao, trecho: string) {
  assert(r.erros.some(e => e.toLowerCase().includes(trecho.toLowerCase())), `Nenhum erro contém "${trecho}". Erros: ${r.erros.join('; ')}`)
}

// ─── 1. COMPRIMENTO MÍNIMO (8 caracteres) ───────────────────
teste('Rejeita senha vazia', () => {
  assertInvalida(validarSenha(''))
})

teste('Rejeita senha com 1 caractere', () => {
  assertInvalida(validarSenha('A'))
})

teste('Rejeita senha com 7 caracteres (limite inferior)', () => {
  assertInvalida(validarSenha('Abc1@xx'))
  assertContemErro(validarSenha('Abc1@xx'), '8 caracteres')
})

teste('Aceita senha com exatamente 8 caracteres', () => {
  assertValida(validarSenha('Abc1@xxx'))
})

teste('Aceita senha com 20 caracteres', () => {
  assertValida(validarSenha('Abcdefg1@xxxxxxxxxxx'))
})

teste('Rejeita senha com apenas espaços', () => {
  assertInvalida(validarSenha('        '))
})

// ─── 2. LETRA MAIÚSCULA ─────────────────────────────────────
teste('Rejeita senha sem letra maiúscula', () => {
  assertInvalida(validarSenha('abc1@xxx'))
  assertContemErro(validarSenha('abc1@xxx'), 'maiúscula')
})

teste('Aceita senha com maiúscula no início', () => {
  assertValida(validarSenha('Abc1@xxx'))
})

teste('Aceita senha com maiúscula no meio', () => {
  assertValida(validarSenha('abC1@xxx'))
})

teste('Aceita senha com maiúscula no final', () => {
  assertValida(validarSenha('abc1@xxX'))
})

teste('Aceita senha com múltiplas maiúsculas', () => {
  assertValida(validarSenha('ABC1@xxx'))
})

// ─── 3. NÚMERO ───────────────────────────────────────────────
teste('Rejeita senha sem número', () => {
  assertInvalida(validarSenha('Abcde@xx'))
  assertContemErro(validarSenha('Abcde@xx'), 'número')
})

teste('Aceita senha com número no início', () => {
  assertValida(validarSenha('1Abcde@x'))
})

teste('Aceita senha com número no meio', () => {
  assertValida(validarSenha('Abc1de@x'))
})

teste('Aceita senha com número no final', () => {
  assertValida(validarSenha('Abcde@x1'))
})

teste('Aceita senha com múltiplos números', () => {
  assertValida(validarSenha('A123@xxx'))
})

// ─── 4. CARACTERE ESPECIAL ──────────────────────────────────
teste('Rejeita senha sem caractere especial', () => {
  assertInvalida(validarSenha('Abcde1xx'))
  assertContemErro(validarSenha('Abcde1xx'), 'especial')
})

teste('Aceita senha com @', () => { assertValida(validarSenha('Abcde1x@')) })
teste('Aceita senha com !', () => { assertValida(validarSenha('Abcde1x!')) })
teste('Aceita senha com #', () => { assertValida(validarSenha('Abcde1x#')) })
teste('Aceita senha com $', () => { assertValida(validarSenha('Abcde1x$')) })
teste('Aceita senha com %', () => { assertValida(validarSenha('Abcde1x%')) })
teste('Aceita senha com &', () => { assertValida(validarSenha('Abcde1x&')) })
teste('Aceita senha com *', () => { assertValida(validarSenha('Abcde1x*')) })
teste('Aceita senha com _', () => { assertValida(validarSenha('Abcde1x_')) })
teste('Aceita senha com .', () => { assertValida(validarSenha('Abcde1x.')) })

// ─── 5. COMBINAÇÕES INVÁLIDAS (múltiplas regras violadas) ───
teste('Rejeita senha curta, sem maiúscula, sem número e sem especial', () => {
  const r = validarSenha('abc')
  assertInvalida(r, 4)
})

teste('Rejeita senha que tem só números', () => {
  assertInvalida(validarSenha('12345678'))
})

teste('Rejeita senha que tem só maiúsculas', () => {
  assertInvalida(validarSenha('ABCDEFGH'))
})

teste('Rejeita senha que tem só especiais', () => {
  assertInvalida(validarSenha('!@#$%^&*'))
})

// ─── 6. SENHAS VÁLIDAS REALISTAS ────────────────────────────
teste('Aceita "Gtporte@2026"', () => { assertValida(validarSenha('Gtporte@2026')) })
teste('Aceita "Senh@123"', () => { assertValida(validarSenha('Senh@123')) })
teste('Aceita "M1nh@Senh4Forte!"', () => { assertValida(validarSenha('M1nh@Senh4Forte!')) })
teste('Aceita "Tr@nsporte1"', () => { assertValida(validarSenha('Tr@nsporte1')) })

// ─── 7. CASOS LIMITE ────────────────────────────────────────
teste('Rejeita undefined (cast)', () => {
  assertInvalida(validarSenha(undefined as unknown as string))
})

teste('Rejeita null (cast)', () => {
  assertInvalida(validarSenha(null as unknown as string))
})

teste('Aceita senha com acentos e caractere especial', () => {
  assertValida(validarSenha('Açaí@123'))
})

// ─── RESULTADO ──────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
console.log('  RESULTADO DOS TESTES — validarSenha')
console.log('══════════════════════════════════════════\n')

for (const r of resultados) {
  const icon = r.status === 'PASSOU' ? '✅' : '❌'
  console.log(`  ${icon} ${r.nome}`)
  if (r.detalhe) console.log(`     ↳ ${r.detalhe}`)
}

console.log('\n──────────────────────────────────────────')
console.log(`  Total: ${total} | Passou: ${passou} | Falhou: ${falhou}`)
console.log(`  Taxa de sucesso: ${((passou / total) * 100).toFixed(1)}%`)
console.log('──────────────────────────────────────────\n')

// Export for report generation
;(globalThis as any).__TEST_RESULTS__ = { total, passou, falhou, resultados }

process.exit(falhou > 0 ? 1 : 0)
