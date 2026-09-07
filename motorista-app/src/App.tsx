import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuth, type Perfil as TipoPerfil } from '@/hooks/useAuth'
import { supabaseConfigurado } from '@/lib/supabase'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Viagem } from '@/pages/Viagem'
import { CheckIn } from '@/pages/CheckIn'
import { Avisos } from '@/pages/Avisos'
import { Documentos } from '@/pages/Documentos'
import { Perfil } from '@/pages/Perfil'

function Aviso({titulo,texto,acao}:{titulo:string;texto:string;acao?:{label:string;onClick:()=>void}}) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
    <AlertTriangle className="h-10 w-10 text-gold-500" />
    <h1 className="text-lg font-bold">{titulo}</h1>
    <p className="text-sm text-white/50">{texto}</p>
    {acao && <button onClick={acao.onClick} className="btn-outline mt-2 max-w-xs">{acao.label}</button>}
  </div>
}

function AppAutenticado({perfil,logout}:{perfil:TipoPerfil;logout:()=>void}) {
  const [tab, setTab] = useState<Tab>('viagem')

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      {tab === 'viagem' && <Viagem onIrParaCheckIn={()=>setTab('checkin')} />}
      {tab === 'checkin' && <CheckIn />}
      {tab === 'avisos' && <Avisos />}
      {tab === 'documentos' && <Documentos />}
      {tab === 'perfil' && <Perfil perfil={perfil} onLogout={logout} />}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

export default function App() {
  // Um unico useAuth: duas instancias mantinham sessoes independentes, cada uma
  // com sua propria subscription de onAuthStateChange.
  const { session, perfil, loading, isMotorista, login, logout } = useAuth()

  if (!supabaseConfigurado) {
    return <Aviso titulo="App não configurado"
      texto="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente e publique de novo." />
  }

  return (
    <>
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
      ) : !session ? (
        <Login onLogin={login} />
      ) : !isMotorista ? (
        // Perfil ausente ou de outro tipo: antes ficava em spinner infinito, sem saida.
        <Aviso titulo="Este acesso não é de motorista"
          texto={perfil ? `O acesso de ${perfil.nome} é do tipo "${perfil.tipo}". Use o painel administrativo.` : 'Não encontramos o perfil deste acesso. Procure a administração.'}
          acao={{label:'Sair', onClick:logout}} />
      ) : (
        <AppAutenticado perfil={perfil!} logout={logout} />
      )}
    </>
  )
}
