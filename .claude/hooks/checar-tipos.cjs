#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit|Write) — type-check incremental.
 *
 * O GTPorte não tem suíte de testes: o único portão automático de
 * qualidade é o compilador. Este hook roda `tsc --noEmit` depois de cada
 * alteração em src/ e devolve os erros ao agente, para que ele corrija na
 * mesma volta em vez de acumular quebra até o build.
 *
 * Escrito em Node, e não em shell, porque a máquina do grupo não tem jq
 * e o projeto já exige Node — assim o hook roda igual no Git Bash, no
 * PowerShell e no Linux.
 *
 * Nunca interrompe o trabalho: erro de tipo vira contexto, não bloqueio.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..', '..')
const LIMITE_LINHAS = 15

// Compilador local, invocado direto pelo Node: dispensa npx e shell, o
// que evita diferencas entre Git Bash e PowerShell.
const TSC = path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')

function lerEntrada() {
  try {
    const bruto = require('node:fs').readFileSync(0, 'utf8')
    return bruto.trim() ? JSON.parse(bruto) : {}
  } catch {
    return {}
  }
}

const entrada = lerEntrada()
const arquivo =
  entrada?.tool_response?.filePath ?? entrada?.tool_input?.file_path ?? ''

// Só interessa código-fonte TypeScript do próprio app.
const normalizado = String(arquivo).replace(/\\/g, '/')
if (!/\/src\/.*\.tsx?$/.test(normalizado)) process.exit(0)

let saida = ''
try {
  execFileSync(process.execPath, [TSC, '--noEmit', '-p', 'tsconfig.app.json'], {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  process.exit(0)
} catch (e) {
  saida = `${e.stdout ?? ''}${e.stderr ?? ''}`
}

const erros = saida.split(/\r?\n/).filter((l) => l.includes('error TS'))
if (erros.length === 0) process.exit(0)

const resumo = erros.slice(0, LIMITE_LINHAS).join('\n')
const extras = erros.length > LIMITE_LINHAS ? `\n… e mais ${erros.length - LIMITE_LINHAS}.` : ''

process.stdout.write(
  JSON.stringify({
    systemMessage: `tsc --noEmit: ${erros.length} erro(s) de tipo.`,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `O type-check falhou após esta alteração (npm run lint):\n${resumo}${extras}`,
    },
  }),
)
