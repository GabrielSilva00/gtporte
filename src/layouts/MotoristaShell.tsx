import { useAuth } from '../auth/AuthProvider'
import PortalShell from './PortalShell'

const ITENS = [
  { para: '/motorista', rotulo: 'Passageiros', fim: true },
  { para: '/motorista/rotas', rotulo: 'Minhas rotas' },
  { para: '/motorista/avisos', rotulo: 'Avisos' },
  { para: '/motorista/mensagens', rotulo: 'Mensagens' },
]

/** Painel do motorista (RF12, RF15, RF16). */
export default function MotoristaShell() {
  const { motoristaId } = useAuth()

  if (!motoristaId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-[17px] font-semibold">Cadastro de motorista pendente</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Seu usuário tem perfil de motorista, mas ainda não está vinculado a um cadastro na
            frota. Peça ao setor de transporte para criar seu registro em <b>Motoristas</b> e
            associá-lo a este e-mail.
          </p>
        </div>
      </div>
    )
  }

  return <PortalShell titulo="Painel do motorista" itens={ITENS} />
}
