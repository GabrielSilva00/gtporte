/**
 * Ultima resposta boa de cada consulta, guardada no aparelho. Serve de
 * reserva quando a rede cai: a lista de passageiros, as rotas e o id do
 * motorista continuam na tela mesmo sem sinal na porta do onibus.
 * Apagado no logout (limparCacheLocal).
 */
const PREFIXO = 'gtporte-motorista:cache:'

export function gravarCache<T>(chave: string, valor: T) {
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)) } catch { /* sem espaco: segue sem cache */ }
}

export function lerCache<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(PREFIXO + chave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export function limparCacheLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIXO)) localStorage.removeItem(k)
  } catch { /* nada a limpar */ }
}
