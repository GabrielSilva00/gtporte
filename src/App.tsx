import { Navigate, Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './auth/RotaProtegida'
import { supabaseConfigurado } from './lib/supabase'

// Público
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import Configuracao from './pages/Configuracao'

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

const STAFF = ['admin', 'operador'] as const

export default function App() {
  if (!supabaseConfigurado) return <Configuracao />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />

      {/* ---------------- Painel administrativo (RF20/RF21) ---------------- */}
      <Route
        element={
          <RotaProtegida perfis={[...STAFF]}>
            <AppShell />
          </RotaProtegida>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="estudantes" element={<Estudantes />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="alocacao" element={<Alocacao />} />
        <Route path="rotas" element={<Rotas />} />
        <Route path="veiculos" element={<Veiculos />} />
        <Route path="motoristas" element={<Motoristas />} />
        <Route path="universidades" element={<Universidades />} />
        <Route path="presenca" element={<Presenca />} />
        <Route path="relatorios" element={<Relatorios />} />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
