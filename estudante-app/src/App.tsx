import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { BarraConexao } from '@/components/StatusConexao'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Inicio } from '@/pages/Inicio'
import { MinhaRota } from '@/pages/MinhaRota'
import { Documentos } from '@/pages/Documentos'
import { Historico } from '@/pages/Historico'
import { Feedback } from '@/pages/Feedback'
import { Perfil } from '@/pages/Perfil'
import { CompletarCadastro } from '@/pages/CompletarCadastro'

function AppAutenticado() {
  const { perfil, estudanteId, logout, recarregar } = useAuth()
  const [tab, setTab] = useState<Tab>('inicio')

  if (!perfil) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  // Conta recem-criada tem `perfil` mas ainda nao tem `estudante`: sem esse
  // registro nao ha documentos, historico nem alocacao. O cadastro vem antes
  // de qualquer aba (RF01).
  if (!estudanteId) {
    return <CompletarCadastro perfil={perfil} onPronto={recarregar} />
  }

  return (
    <div className="min-h-screen">
      {tab === 'inicio' && <Inicio estudanteId={estudanteId} onIr={setTab} />}
      {tab === 'rota' && <MinhaRota />}
      {tab === 'documentos' && <Documentos estudanteId={estudanteId} />}
      {tab === 'historico' && <Historico estudanteId={estudanteId} />}
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
      <BarraConexao />
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !session ? (
        <Login onLogin={login} onCadastrar={cadastrar} />
      ) : (
        <AppAutenticado />
      )}
    </>
  )
}
