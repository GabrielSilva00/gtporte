import { useSyncExternalStore } from 'react'

export type Tema = 'claro' | 'escuro' | 'sistema'
const CHAVE = 'gtporte-motorista:tema'

/** localStorage pode lancar (aba anonima, cookies bloqueados): nunca deixar quebrar a tela. */
function lerSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch { /* sem storage: cai no padrao */ }
  // O app nasceu escuro, que tambem cansa menos a vista dirigindo a noite.
  return 'escuro'
}

function sistemaClaro() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
}

export function aplicarTema(tema: Tema) {
  const claro = tema === 'claro' || (tema === 'sistema' && sistemaClaro())
  document.documentElement.classList.toggle('claro', claro)
  // A barra do navegador no celular acompanha o tema do app.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', claro ? '#F1F5F9' : '#0F172A')
}

// Estado unico no modulo: o seletor no Perfil e o resto do app enxergam o mesmo tema.
let atual: Tema = typeof window === 'undefined' ? 'escuro' : lerSalvo()
const ouvintes = new Set<() => void>()

if (typeof window !== 'undefined') {
  aplicarTema(atual)
  // Em "sistema", acompanha o aparelho enquanto o app estiver aberto.
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (atual === 'sistema') aplicarTema('sistema')
  })
}

function setTema(t: Tema) {
  atual = t
  try { localStorage.setItem(CHAVE, t) } catch { /* segue sem persistir */ }
  aplicarTema(t)
  ouvintes.forEach((f) => f())
}

function inscrever(f: () => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

export function useTema() {
  const tema = useSyncExternalStore(inscrever, () => atual, () => atual)
  return { tema, setTema }
}
