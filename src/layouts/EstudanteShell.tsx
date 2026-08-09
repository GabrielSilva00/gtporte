import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import PortalShell from './PortalShell'

const ITENS = [
  { para: '/estudante', rotulo: 'Minha rota', fim: true },
  { para: '/estudante/documentos', rotulo: 'Documentos' },
  { para: '/estudante/historico', rotulo: 'Histórico' },
  { para: '/estudante/feedback', rotulo: 'Avaliar' },
  { para: '/estudante/perfil', rotulo: 'Meus dados' },
]

/**
 * Painel do estudante. Enquanto o cadastro acadêmico não existir, todas as
 * rotas levam à etapa "Completar cadastro" (RF01).
 */
export default function EstudanteShell() {
  const { estudanteId } = useAuth()

  if (!estudanteId) return <Navigate to="/estudante/completar" replace />

  return <PortalShell titulo="Painel do estudante" itens={ITENS} />
}
