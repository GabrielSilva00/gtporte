import { useState } from 'react'
import { ArrowLeft, Lock, Menu } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAcesso } from '@/hooks/useAcesso'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { ToastContainer } from '@/components/Toast'
import { BarraConexao } from '@/components/StatusConexao'
import { SinoNotificacoes } from '@/components/SinoNotificacoes'
import { MenuLateral } from '@/components/MenuLateral'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Inicio } from '@/pages/Inicio'
import { MinhaRota } from '@/pages/MinhaRota'
import { Documentos } from '@/pages/Documentos'
import { Historico } from '@/pages/Historico'
import { Feedback } from '@/pages/Feedback'
import { Perfil } from '@/pages/Perfil'
import { CompletarCadastro } from '@/pages/CompletarCadastro'

/**
 * Abas que dependem de documentacao aprovada. O cadastro pode ser
 * concluido com um documento so, entao ate a secretaria validar o aluno
 * fica com acesso parcial: ve o que precisa resolver, nao o que ainda
 * nao tem (rota, historico de viagens, contato com o motorista).
 */
const ABAS_RESTRITAS: Tab[] = ['rota', 'historico', 'feedback']

function AguardandoValidacao({ documentos, onIr }: { documentos: number; onIr: (t: Tab) => void }) {
  return (
    <div className="flex flex-col items-center px-8 pt-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warn/10 text-warn">
        <Lock className="h-7 w-7" />
      </div>
      <p className="text-lg font-semibold">Aguardando validação</p>
      <p className="mt-2 text-sm text-muted">
        Esta seção é liberada quando a secretaria aprovar sua documentação e você for alocado em
        uma rota.
      </p>
      <p className="mt-3 text-xs text-faint">
        {documentos === 0
          ? 'Você ainda não enviou documentos.'
          : `${documentos} de 4 documentos enviados.`}
      </p>
      <button onClick={() => onIr('documentos')} className="btn-primary mt-6 max-w-xs">
        Ver meus documentos
      </button>
    </div>
  )
}

function AppAutenticado() {
  const { perfil, estudanteId, logout, recarregar } = useAuth()
  const { situacao, loading: carregandoAcesso } = useAcesso(estudanteId)
  const [tab, setTab] = useState<Tab>('inicio')
  const [menu, setMenu] = useState(false)

  if (!perfil) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  // Conta sem registro em `estudante`: o cadastro vem antes de qualquer
  // aba (RF01). Sem ele nao ha documentos, historico nem alocacao.
  if (!estudanteId) {
    return (
      <CompletarCadastro
        perfil={perfil}
        modo="completar"
        onPronto={recarregar}
        onSair={logout}
      />
    )
  }

  if (carregandoAcesso) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const bloqueada = ABAS_RESTRITAS.includes(tab) && !situacao.acesso_liberado

  const TITULO: Record<Tab, string> = {
    inicio: 'Início',
    rota: 'Minha Rota',
    documentos: 'Documentos',
    historico: 'Histórico',
    feedback: 'Mensagens',
    perfil: 'Perfil',
  }

  return (
    <div className="min-h-screen">
      <SinoNotificacoes estudanteId={estudanteId} onIr={setTab} />

      {/* Cabecalho: na inicial abre o menu; nas demais telas volta para ela. */}
      <header className="fixed inset-x-0 top-0 z-[80] flex items-center gap-2 border-b border-line/60 bg-surface/95 px-3 py-2 backdrop-blur-xl safe-t">
        {tab === 'inicio' ? (
          <button onClick={() => setMenu(true)} aria-label="Abrir menu" className="p-1.5">
            <Menu className="h-5 w-5 text-ink" />
          </button>
        ) : (
          <button onClick={() => setTab('inicio')} aria-label="Voltar ao início" className="p-1.5">
            <ArrowLeft className="h-5 w-5 text-ink" />
          </button>
        )}
        <span className="text-sm font-bold">{TITULO[tab]}</span>
        {tab !== 'inicio' && (
          <button onClick={() => setMenu(true)} aria-label="Abrir menu" className="ml-auto mr-12 p-1.5">
            <Menu className="h-5 w-5 text-muted" />
          </button>
        )}
      </header>

      <MenuLateral
        aberto={menu}
        ativa={tab}
        bloqueadas={situacao.acesso_liberado ? [] : ABAS_RESTRITAS}
        nome={perfil.nome}
        prontuario={null}
        onIr={setTab}
        onFechar={() => setMenu(false)}
        onSair={logout}
      />
      {bloqueada ? (
        <AguardandoValidacao documentos={situacao.documentos_enviados} onIr={setTab} />
      ) : (
        <>
          {tab === 'inicio' && <Inicio estudanteId={estudanteId} onIr={setTab} />}
          {tab === 'rota' && <MinhaRota />}
          {tab === 'documentos' && <Documentos estudanteId={estudanteId} />}
          {tab === 'historico' && <Historico estudanteId={estudanteId} />}
          {tab === 'feedback' && <Feedback />}
          {tab === 'perfil' && <Perfil perfil={perfil} estudanteId={estudanteId} onLogout={logout} />}
        </>
      )}
      <BottomNav
        active={tab}
        onChange={setTab}
        bloqueadas={situacao.acesso_liberado ? [] : ABAS_RESTRITAS}
      />
    </div>
  )
}

export default function App() {
  const { session, loading, login } = useAuth()
  const [criandoConta, setCriandoConta] = useState(false)

  return (
    <>
      <BarraConexao />
      <ToastContainer />
      {loading ? (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !session ? (
        criandoConta ? (
          // Cadastro completo antes de existir conta: e-mail e senha sao
          // o ultimo passo, e a conta so nasce no fim.
          <CompletarCadastro
            modo="novo"
            onPronto={() => setCriandoConta(false)}
            onCancelar={() => setCriandoConta(false)}
          />
        ) : (
          <Login onLogin={login} onCriarConta={() => setCriandoConta(true)} />
        )
      ) : (
        <AppAutenticado />
      )}
    </>
  )
}
