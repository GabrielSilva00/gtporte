import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Viagem } from '@/pages/Viagem'
import { Avisos } from '@/pages/Avisos'
import { Documentos } from '@/pages/Documentos'
import { Historico } from '@/pages/Historico'
import { Perfil } from '@/pages/Perfil'

function AppAutenticado() {
  const { perfil, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('viagem')

  if (!perfil) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>

  return (
    <div className="min-h-screen">
      {tab === 'viagem' && <Viagem />}
      {tab === 'avisos' && <Avisos />}
      {tab === 'documentos' && <Documentos />}
      {tab === 'historico' && <Historico />}
      {tab === 'perfil' && <Perfil perfil={perfil} onLogout={logout} />}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

export default function App() {
  const { session, loading, login } = useAuth()
  return (
    <>
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : !session ? (
        <Login onLogin={login} />
      ) : (
        <AppAutenticado />
      )}
    </>
  )
}
