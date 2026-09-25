/**
 * Fila de operacoes feitas sem internet.
 *
 * Na porta do onibus o sinal falha. O check-in, o desfazer e a troca de
 * situacao da viagem nao podem se perder por isso: sem rede, a operacao
 * entra nesta fila (salva no aparelho), a tela ja mostra o resultado, e a
 * fila e enviada ao banco quando a conexao volta.
 *
 * A posicao do GPS NAO passa por aqui de proposito: uma posicao atrasada
 * dispararia no banco o aviso de "onibus chegando" quando o onibus ja foi
 * embora. Sem rede, a posicao e simplesmente descartada.
 */

export type Trecho = 'ida' | 'volta'

export type Operacao =
  | { tipo: 'confirmar'; estudanteId: string; nome: string; trecho: Trecho; data: string }
  | { tipo: 'desfazer'; estudanteId: string; nome: string; trecho: Trecho; data: string }
  | { tipo: 'situacao'; rotaId: string; situacao: 'aguardando' | 'em_rota' | 'concluida' }

export interface ItemFila {
  id: string
  criadoEm: number
  op: Operacao
}

/** Resultado de uma tentativa de envio: 'rede' mantem na fila, 'recusada' descarta. */
export type Resultado = { ok: true } | { ok: false; motivo: 'rede' } | { ok: false; motivo: 'recusada'; mensagem: string }

const CHAVE = 'gtporte-motorista:fila'

let itens: ItemFila[] = carregar()
const ouvintes = new Set<() => void>()

function carregar(): ItemFila[] {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(CHAVE)
    return v ? (JSON.parse(v) as ItemFila[]) : []
  } catch {
    return []
  }
}

function salvar(novos: ItemFila[]) {
  itens = novos
  try { localStorage.setItem(CHAVE, JSON.stringify(itens)) } catch { /* sem storage: fica so na memoria */ }
  ouvintes.forEach((f) => f())
}

export function itensDaFila(): ItemFila[] {
  return itens
}

export function inscreverFila(f: () => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

function chaveDe(op: Operacao) {
  return op.tipo === 'situacao' ? `sit:${op.rotaId}` : `pax:${op.estudanteId}:${op.trecho}:${op.data}`
}

/**
 * Junta a operacao nova com o que ja esta na fila:
 *  - confirmar seguido de desfazer (ou o contrario) do mesmo aluno e
 *    trecho se anulam, nada precisa ir ao banco;
 *  - a situacao da viagem vale a ultima escolhida.
 * Funcao pura, exportada para os testes.
 */
export function juntar(fila: ItemFila[], novo: ItemFila): ItemFila[] {
  const chave = chaveDe(novo.op)
  const anterior = fila.find((i) => chaveDe(i.op) === chave)
  if (!anterior) return [...fila, novo]
  const resto = fila.filter((i) => i !== anterior)
  if (novo.op.tipo === 'situacao') return [...resto, novo]
  // Mesmo tipo repetido: fica o primeiro. Tipos opostos: um desfaz o outro.
  return anterior.op.tipo === novo.op.tipo ? fila : resto
}

export function enfileirar(op: Operacao) {
  const novo: ItemFila = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadoEm: Date.now(), op }
  salvar(juntar(itens, novo))
}

export function limparFila() {
  salvar([])
}

let enviando = false

/**
 * Envia a fila em ordem. Para no primeiro erro de rede (o resto fica para a
 * proxima tentativa); operacao recusada pelo banco sai da fila e e
 * informada em aoRecusar, para o motorista saber que aquele registro nao
 * valeu.
 */
export async function sincronizar(
  executar: (op: Operacao) => Promise<Resultado>,
  aoRecusar: (op: Operacao, mensagem: string) => void,
): Promise<number> {
  if (enviando || itens.length === 0) return 0
  enviando = true
  let enviados = 0
  try {
    while (itens.length > 0) {
      const item = itens[0]
      const r = await executar(item.op)
      if (!r.ok && r.motivo === 'rede') break
      if (!r.ok && r.motivo === 'recusada') aoRecusar(item.op, r.mensagem)
      else enviados++
      salvar(itens.filter((i) => i.id !== item.id))
    }
  } finally {
    enviando = false
  }
  return enviados
}
