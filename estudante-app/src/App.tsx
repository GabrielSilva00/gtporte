import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAcesso } from '@/hooks/useAcesso'
import { TITULO_SECAO, type Tab } from '@/lib/navegacao'
import { ToastContainer } from '@/components/Toast'
import { BarraConexao } from '@/components/StatusConexao'
import { SinoNotificacoes } from '@/components/SinoNotificacoes'
import { Spinner } from '@/components/Spinner'
import { Login } from '@/pages/Login'
import { Inicio } from '@/pages/Inicio'
import { MinhaRota } from '@/pages/MinhaRota'
import { RotasSemana } from '@/pages/RotasSemana'
import { Documentos } from '@/pages/Documentos'
import { Historico } from '@/pages/Historico'
import { Conversas } from '@/pages/Conversas'
import { Perfil } from '@/pages/Perfil'
import { CompletarCadastro } from '@/pages/CompletarCadastro'

/**
 * Abas que so existem com o cadastro validado. Enquanto o aluno esta na
 * fila de validacao ele usa o app — documentos, perfil, historico e
 * conversa com a secretaria —, mas nenhum dado externo: rota, motorista,
 * veiculo e paradas. O banco reforca a mesma regra (0027).
 */
const ABAS_RESTRITAS: Tab[] = ['rota']

function AguardandoValidacao({ documentos, onIr }: { documentos: number; onIr: (t: Tab) => void }) {
  return (
    <div className="flex flex-col items-center px-8 pt-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warn/10 text-warn">
        <Lock className="h-7 w-7" />
      </div>
      <p className="text-lg font-semibold">Aguardando validação</p>
      <p className="mt-2 text-sm text-muted">
        Esta seção é liberada quando a secretaria validar o seu cadastro e você for alocado em
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
  // dentro da aba Rota: lista da semana ou detalhe do dia
  const [rotaAberta, setRotaAberta] = useState(false)

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

  const validado = situacao.acesso_liberado
  const bloqueada = ABAS_RESTRITAS.includes(tab) && !validado
  const naInicial = tab === 'inicio'

  const voltar = () => (tab === 'rota' && rotaAberta ? setRotaAberta(false) : setTab('inicio'))

  return (
    <div className="min-h-screen">
      {/*
        Cabecalho. Na inicial nao ha menu: so o titulo e o sino, na mesma
        linha. Nas demais telas entra o botao de voltar para a inicial.
      */}
      <header className="fixed inset-x-0 top-0 z-[80] flex items-center gap-2 border-b border-line/60 bg-surface/95 px-3 py-2 backdrop-blur-xl safe-t">
        {!naInicial && (
          <button onClick={voltar} aria-label="Voltar" className="-ml-1 p-1.5">
            <ArrowLeft className="h-5 w-5 text-ink" />
          </button>
        )}
        <span className={`flex-1 truncate font-bold ${naInicial ? 'pl-1 text-lg' : 'text-sm'}`}>
          {TITULO_SECAO[tab]}
        </span>
        <SinoNotificacoes estudanteId={estudanteId} onIr={setTab} destaque={naInicial} />
      </header>

      {bloqueada ? (
        <AguardandoValidacao documentos={situacao.documentos_enviados} onIr={setTab} />
      ) : (
        <>
          {tab === 'inicio' && (
            <Inicio
              estudanteId={estudanteId}
              validado={validado}
              statusCadastro={situacao.status_documental}
              onIr={setTab}
            />
          )}
          {tab === 'rota' &&
            (rotaAberta ? <MinhaRota /> : <RotasSemana onAbrir={() => setRotaAberta(true)} />)}
          {tab === 'documentos' && <Documentos estudanteId={estudanteId} />}
          {tab === 'historico' && <Historico estudanteId={estudanteId} />}
          {tab === 'feedback' && <Conversas validado={validado} />}
          {tab === 'perfil' && <Perfil perfil={perfil} estudanteId={estudanteId} onLogout={logout} />}
        </>
      )}
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
