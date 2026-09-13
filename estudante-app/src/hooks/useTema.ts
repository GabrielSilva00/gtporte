import { useCallback, useEffect, useState } from 'react'

export type Tema = 'claro' | 'escuro' | 'sistema'
const CHAVE = 'gtporte:tema'

/** localStorage pode lancar (aba anonima, cookies bloqueados) — nunca deixar quebrar a tela. */
function lerSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch { /* sem storage: cai no padrao */ }
  return 'sistema'
}

function sistemaEscuro() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function aplicarTema(tema: Tema) {
  const escuro = tema === 'escuro' || (tema === 'sistema' && sistemaEscuro())
  document.documentElement.classList.toggle('dark', escuro)
  // A barra do navegador no celular acompanha o tema do app.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', escuro ? '#0F172A' : '#F8FAFC')
}

export function useTema() {
  const [tema, setTemaEstado] = useState<Tema>(lerSalvo)

  const setTema = useCallback((t: Tema) => {
    setTemaEstado(t)
    try { localStorage.setItem(CHAVE, t) } catch { /* segue sem persistir */ }
    aplicarTema(t)
  }, [])

  useEffect(() => {
    aplicarTema(tema)
    if (tema !== 'sistema') return
    // Em "sistema", acompanha o aparelho enquanto o app estiver aberto.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const ouvir = () => aplicarTema('sistema')
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [tema])

  const escuroAtivo = tema === 'escuro' || (tema === 'sistema' && sistemaEscuro())
  return { tema, setTema, escuroAtivo }
}
