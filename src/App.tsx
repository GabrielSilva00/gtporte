import { Navigate, Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './auth/RotaProtegida'
import { supabaseConfigurado } from './lib/supabase'

// Público
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import ConfiguracaoPendente from './pages/ConfiguracaoPendente'

// Administrativo
import AppShell from './layouts/AppShell'
import Dashboard from './pages/Dashboard'
import Estudantes from './pages/Estudantes'
import Documentos from './pages/Documentos'
import Alocacao from './pages/Alocacao'
import Rotas from './pages/Rotas'
import Veiculos from './pages/Veiculos'
import Motoristas from './pages/Motoristas'
import Universidades from './pages/Universidades'
import Presenca from './pages/Presenca'
import Relatorios from './pages/Relatorios'
import Funcionarios from './pages/Funcionarios'
import Mensagens from './pages/Mensagens'
import Configuracoes from './pages/Configuracoes'

// Estudante
import EstudanteShell from './layouts/EstudanteShell'
import MinhaRota from './pages/estudante/MinhaRota'
import CompletarCadastro from './pages/estudante/CompletarCadastro'
import MeusDocumentos from './pages/estudante/MeusDocumentos'
import Historico from './pages/estudante/Historico'
import Feedback from './pages/estudante/Feedback'
import MeuPerfil from './pages/estudante/MeuPerfil'

// Motorista
import MotoristaShell from './layouts/MotoristaShell'
import Passageiros from './pages/motorista/Passageiros'
import MinhasRotas from './pages/motorista/MinhasRotas'
import Avisos from './pages/motorista/Avisos'

// Estudante + motorista
import MinhasMensagens from './pages/MinhasMensagens'

const STAFF = ['admin', 'operador'] as const

export default function App() {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />

      {/* ---------------- Painel administrativo (RF20/RF21) ---------------- */}
      {/* A prop `pagina` liga cada rota à permissão individual concedida em
          Funcionários; o administrador tem acesso a todas por definição. */}
      <Route
        element={
          <RotaProtegida perfis={[...STAFF]}>
            <AppShell />
          </RotaProtegida>
        }
      >
        <Route
          index
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="dashboard">
              <Dashboard />
            </RotaProtegida>
          }
        />
        <Route
          path="estudantes"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="estudantes">
              <Estudantes />
            </RotaProtegida>
          }
        />
        <Route
          path="documentos"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="documentos">
              <Documentos />
            </RotaProtegida>
          }
        />
        <Route
          path="alocacao"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="alocacao">
              <Alocacao />
            </RotaProtegida>
          }
        />
        <Route
          path="rotas"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="rotas">
              <Rotas />
            </RotaProtegida>
          }
        />
        <Route
          path="veiculos"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="veiculos">
              <Veiculos />
            </RotaProtegida>
          }
        />
        <Route
          path="motoristas"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="motoristas">
              <Motoristas />
            </RotaProtegida>
          }
        />
        <Route
          path="universidades"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="universidades">
              <Universidades />
            </RotaProtegida>
          }
        />
        <Route
          path="presenca"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="presenca">
              <Presenca />
            </RotaProtegida>
          }
        />
        <Route
          path="relatorios"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="relatorios">
              <Relatorios />
            </RotaProtegida>
          }
        />
        <Route
          path="solicitacoes"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="solicitacoes">
              <Mensagens tipo="solicitacao" />
            </RotaProtegida>
          }
        />
        <Route
          path="mensagens"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="mensagens">
              <Mensagens tipo="mensagem" />
            </RotaProtegida>
          }
        />
        <Route
          path="configuracoes"
          element={
            <RotaProtegida perfis={[...STAFF]} pagina="configuracoes">
              <Configuracoes />
            </RotaProtegida>
          }
        />
        {/* RF20: gestão de acessos é exclusiva de administradores */}
        <Route
          path="funcionarios"
          element={
            <RotaProtegida perfis={['admin']}>
              <Funcionarios />
            </RotaProtegida>
          }
        />
      </Route>

      {/* ---------------- Painel do estudante ---------------- */}
      <Route
        path="/estudante"
        element={
          <RotaProtegida perfis={['estudante']}>
            <EstudanteShell />
          </RotaProtegida>
        }
      >
        <Route index element={<MinhaRota />} />
        <Route path="documentos" element={<MeusDocumentos />} />
        <Route path="historico" element={<Historico />} />
        <Route path="mensagens" element={<MinhasMensagens />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="perfil" element={<MeuPerfil />} />
      </Route>

      {/* Etapa 2 do cadastro fica fora do shell — não tem abas ainda */}
      <Route
        path="/estudante/completar"
        element={
          <RotaProtegida perfis={['estudante']}>
            <CompletarCadastro />
          </RotaProtegida>
        }
      />

      {/* ---------------- Painel do motorista ---------------- */}
      <Route
        path="/motorista"
        element={
          <RotaProtegida perfis={['motorista']}>
            <MotoristaShell />
          </RotaProtegida>
        }
      >
        <Route index element={<Passageiros />} />
        <Route path="rotas" element={<MinhasRotas />} />
        <Route path="avisos" element={<Avisos />} />
        <Route path="mensagens" element={<MinhasMensagens />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
