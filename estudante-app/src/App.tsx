import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { MinhaRota } from '@/pages/MinhaRota'
import { Documentos } from '@/pages/Documentos'
import { Historico } from '@/pages/Historico'
import { Feedback } from '@/pages/Feedback'
import { Perfil } from '@/pages/Perfil'

function AppAutenticado() {
  const { perfil, estudanteId, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('rota')

  if (!perfil) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>

  return (
    <div className="min-h-screen">
      {tab === 'rota' && <MinhaRota />}
      {tab === 'documentos' && estudanteId && <Documentos estudanteId={estudanteId} />}
      {tab === 'historico' && estudanteId && <Historico estudanteId={estudanteId} />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'perfil' && <Perfil perfil={perfil} estudanteId={estudanteId} onLogout={logout} />}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

export default function App() {
  const { session, loading, login, cadastrar } = useAuth()
  return (
    <>
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : !session ? (
        <Login onLogin={login} onCadastrar={cadastrar} />
      ) : (
        <AppAutenticado />
      )}
    </>
  )
}
