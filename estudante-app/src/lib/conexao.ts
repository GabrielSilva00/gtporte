/**
 * Estado de conectividade do app (RF: o aluno precisa saber se o que ve na
 * tela esta atualizado). Guarda duas coisas:
 *  - online: se o navegador tem rede
 *  - pendentes: quantas requisicoes ao Supabase estao em voo agora
 * A contagem e alimentada pelo fetch instrumentado em lib/supabase.ts, entao
 * qualquer consulta do app aparece no indicador sem precisar avisar nada.
 */
export type EstadoConexao = {
  online: boolean
  pendentes: number
  ultimaSync: number | null
  falhou: boolean
}

const estado: EstadoConexao = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendentes: 0,
  ultimaSync: null,
  falhou: false,
}

const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function inscrever(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

// useSyncExternalStore exige identidade estavel: so troca a referencia quando
// algo muda de fato, senao o React entra em laco de renderizacao.
let snapshot: EstadoConexao = { ...estado }
export function lerEstado() {
  return snapshot
}
function commit() {
  snapshot = { ...estado }
  avisar()
}

export function marcarInicio() {
  estado.pendentes += 1
  commit()
}

export function marcarFim(ok: boolean) {
  estado.pendentes = Math.max(0, estado.pendentes - 1)
  estado.falhou = !ok
  if (ok) estado.ultimaSync = Date.now()
  commit()
}

if (typeof window !== 'undefined') {
  const atualizarRede = () => {
    estado.online = navigator.onLine
    if (!navigator.onLine) estado.pendentes = 0
    commit()
  }
  window.addEventListener('online', atualizarRede)
  window.addEventListener('offline', atualizarRede)
}
