import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuth, type Perfil as TipoPerfil } from '@/hooks/useAuth'
import { supabaseConfigurado } from '@/lib/supabase'
import { ABAS, type Destino, type SubPerfil, type Tab } from '@/lib/navegacao'
import { inscreverFila, itensDaFila } from '@/lib/filaOffline'
import { aoRecusarOperacao, contarNaoLidas, sincronizarFila, useConversasMotorista, useRecadosNaoLidos } from '@/hooks/useMotorista'
import { useTema } from '@/hooks/useTema'
import { BottomNav } from '@/components/BottomNav'
import { Cabecalho } from '@/components/Cabecalho'
import { ToastContainer, toast } from '@/components/Toast'
import { TelaCarregamento } from '@/components/TelaCarregamento'
import { Login } from '@/pages/Login'
import { Viagem } from '@/pages/Viagem'
import { CheckIn } from '@/pages/CheckIn'
import { Rotas } from '@/pages/Rotas'
import { Conversas } from '@/pages/Conversas'
import { Perfil } from '@/pages/Perfil'

function Aviso({titulo,texto,acao}:{titulo:string;texto:string;acao?:{label:string;onClick:()=>void}}) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
    <AlertTriangle className="h-10 w-10 text-gold-500" />
    <h1 className="text-lg font-bold">{titulo}</h1>
    <p className="text-sm text-white/50">{texto}</p>
    {acao && <button onClick={acao.onClick} className="btn-outline mt-2 max-w-xs">{acao.label}</button>}
  </div>
}

/**
 * Envia a fila offline quando a rede volta, ao abrir o app e a cada 30 s
 * enquanto houver algo guardado. Registro recusado pelo banco (ex.: aluno
 * trocou de rota) vira aviso na tela.
 */
function useSincronizacao() {
  const fila = useSyncExternalStore(inscreverFila, itensDaFila, itensDaFila)
  useEffect(() => {
    aoRecusarOperacao((op, msg) => {
      const quem = op.tipo === 'situacao' ? 'Situação da viagem' : `${op.tipo === 'confirmar' ? 'Embarque' : 'Desfazer embarque'} de ${op.nome.split(' ')[0]}`
      toast(`${quem} não foi aceito: ${msg}`, 'err')
    })
    const enviar = () => {
      sincronizarFila().then((n) => { if (n > 0) toast(`${n} registro${n === 1 ? '' : 's'} feito${n === 1 ? '' : 's'} sem internet enviado${n === 1 ? '' : 's'}`) })
    }
    enviar()
    window.addEventListener('online', enviar)
    return () => window.removeEventListener('online', enviar)
  }, [])
  useEffect(() => {
    if (fila.length === 0) return
    const t = setInterval(() => { if (navigator.onLine) void sincronizarFila() }, 30000)
    return () => clearInterval(t)
  }, [fila.length])
  return fila.length
}

function AppAutenticado({perfil,logout}:{perfil:TipoPerfil;logout:()=>void}) {
  const [tab, setTab] = useState<Tab>('viagem')
  const [sub, setSub] = useState<SubPerfil>(null)
  const naFila = useSincronizacao()
  const conversas = useConversasMotorista()
  const { naoLidos: recados, refresh: atualizarRecados } = useRecadosNaoLidos()
  const naoLidas = contarNaoLidas(conversas.conversas) + recados

  // Ao sair de Mensagens, o contador da secretaria reflete o que foi lido la.
  useEffect(() => { if (tab !== 'mensagens') void atualizarRecados() }, [tab, atualizarRecados])

  const irPara = useCallback((d: Destino) => {
    if (d === 'documentos' || d === 'historico') { setSub(d); setTab('perfil') }
    else { setSub(null); setTab(d) }
    window.scrollTo(0, 0)
  }, [])

  const titulo = tab === 'perfil' && sub === 'historico' ? 'Histórico' : tab === 'perfil' && sub === 'documentos' ? 'Documentos' : ABAS.find((a) => a.id === tab)!.titulo

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <Cabecalho titulo={titulo} naFila={naFila} onIr={irPara} />
      {tab === 'viagem' && <Viagem onIrParaCheckIn={()=>setTab('checkin')} />}
      {tab === 'checkin' && <CheckIn />}
      {tab === 'rotas' && <Rotas />}
      {tab === 'mensagens' && <Conversas dados={conversas} recadosNaoLidos={recados} />}
      {tab === 'perfil' && <Perfil perfil={perfil} onLogout={logout} sub={sub} onSub={setSub} />}
      <BottomNav active={tab} onChange={(t) => irPara(t)} naoLidas={naoLidas} />
    </div>
  )
}

export default function App() {
  useTema()
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
      <TelaCarregamento carregando={loading} />
      {loading ? null : !session ? (
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
