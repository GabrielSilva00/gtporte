/**
 * O QR do aluno carrega o prontuario. Alguns geradores embutem o codigo numa
 * URL ou atras de um prefixo, entao ficamos com a maior sequencia de digitos
 * lida — o prontuario tem no minimo seis, os demais numeros de uma URL
 * (porta, versao) sao curtos.
 */
export function prontuarioDoQR(texto: string): string {
  const numeros = texto.match(/\d{4,}/g)
  return numeros ? numeros.sort((a, b) => b.length - a.length)[0] : texto.trim()
}

/** Remove acentos para que "jose" encontre "José". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Busca por codigo do aluno ou por nome, sem exigir acentuacao correta. */
export function combina(termo: string, nome: string, prontuario: string): boolean {
  const t = normalizar(termo.trim())
  if (!t) return true
  return normalizar(nome).includes(t) || prontuario.includes(t)
}
