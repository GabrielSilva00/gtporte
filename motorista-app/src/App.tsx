import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Viagem } from '@/pages/Viagem'
import { Avisos } from '@/pages/Avisos'
import { Mensagens } from '@/pages/Mensagens'
import { Perfil } from '@/pages/Perfil'
import { useMensagens } from '@/hooks/useMotorista'

function AppAutenticado() {
  const { perfil, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('viagem')
  const { msgs } = useMensagens()
  const unread = msgs.filter(m => !m.lida).length

  if (!perfil) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>

  return (
    <div className="min-h-screen">
      {tab === 'viagem' && <Viagem />}
      {tab === 'avisos' && <Avisos />}
      {tab === 'mensagens' && <Mensagens />}
      {tab === 'perfil' && <Perfil perfil={perfil} onLogout={logout} />}
      <BottomNav active={tab} onChange={setTab} unread={unread} />
    </div>
  )
}

export default function App() {
  const { session, loading, login } = useAuth()

  return (
    <>
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !session ? (
        <Login onLogin={login} />
      ) : (
        <AppAutenticado />
      )}
    </>
  )
}
