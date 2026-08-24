#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash) — portão de qualidade antes do commit.
 *
 * É o hook atrelado a uma tarefa do git: intercepta `git commit` e só
 * deixa passar se o projeto compilar e se o que está no índice não tiver
 * sujeira de depuração. Um commit que não compila trava o resto do grupo,
 * e é barato demais impedir na origem.
 *
 * Duas checagens:
 *   1. `tsc --noEmit` — o único portão automático que o projeto tem.
 *   2. `console.log` novo no diff staged — rastro de depuração.
 *
 * Não bloqueia `git commit --amend --no-edit`, `git commit -m` de merge
 * nem nada fora de commit: só o que realmente cria conteúdo novo.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const RAIZ = path.resolve(__dirname, '..', '..')
const TSC = path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')

function lerEntrada() {
  try {
    const bruto = fs.readFileSync(0, 'utf8')
    return bruto.trim() ? JSON.parse(bruto) : {}
  } catch {
    return {}
  }
}

/** Permite seguir sem barrar — o caminho normal. */
function liberar() {
  process.exit(0)
}

function bloquear(motivo) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: motivo,
      },
    }),
  )
  process.exit(0)
}

const entrada = lerEntrada()
const comando = String(entrada?.tool_input?.command ?? '')

// Só interessa a criação de um commit de verdade.
if (!/\bgit\s+commit\b/.test(comando)) liberar()
if (/--no-verify/.test(comando)) liberar()

const rodar = (arquivo, args) =>
  execFileSync(arquivo, args, {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

// 1. O projeto compila?
try {
  rodar(process.execPath, [TSC, '--noEmit', '-p', 'tsconfig.app.json'])
} catch (e) {
  const saida = `${e.stdout ?? ''}${e.stderr ?? ''}`
  const erros = saida.split(/\r?\n/).filter((l) => l.includes('error TS'))
  bloquear(
    `Commit barrado: tsc --noEmit falhou com ${erros.length} erro(s).\n` +
      `${erros.slice(0, 10).join('\n')}\n\n` +
      'Corrija os tipos e tente de novo. Para pular esta checagem em um caso ' +
      'excepcional, use --no-verify.',
  )
}

// 2. Sobrou console.log no que está indo para o commit?
let diff = ''
try {
  diff = rodar('git', ['diff', '--cached', '--unified=0', '--', 'src'])
} catch {
  liberar()
}

const suspeitas = diff
  .split(/\r?\n/)
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  .filter((l) => /console\.(log|debug|dir)\s*\(/.test(l))

if (suspeitas.length > 0) {
  bloquear(
    `Commit barrado: ${suspeitas.length} console.log novo(s) no código que vai ser commitado.\n` +
      `${suspeitas.slice(0, 5).map((l) => l.trim()).join('\n')}\n\n` +
      'Remova o rastro de depuração, ou use --no-verify se for intencional.',
  )
}

liberar()
