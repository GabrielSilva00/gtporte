import { Navigate, useLocation } from 'react-router-dom'
import { rotaInicial, useAuth } from './AuthProvider'
import { IconeOnibus } from '../components/icons'
import { PAGINAS, type ChavePagina } from '../lib/paginas'
import type { TipoPerfil } from '../lib/types'

/**
 * Guarda de rota (RF21 / RF20). Cada área do sistema declara quais perfis
 * podem entrar; quem não se enquadra é redirecionado para o painel do seu
 * próprio perfil, em vez de ver uma tela de erro.
 *
 * `pagina` acrescenta a checagem por permissão individual: o administrador
 * libera página a página o que cada operador enxerga.
 */
export function RotaProtegida({
  children,
  perfis,
  pagina,
}: {
  children: React.ReactNode
  perfis: TipoPerfil[]
  pagina?: ChavePagina
}) {
  const { sessao, perfil, carregando, permissoes, podeAcessar } = useAuth()
  const local = useLocation()

  if (carregando) return <Carregando />

  if (!sessao) {
    return <Navigate to="/login" replace state={{ de: local.pathname }} />
  }

  // Sessão válida mas perfil ainda não carregou (primeiro render após login)
  if (!perfil) return <Carregando />

  if (!perfil.ativo) {
    return (
      <Aviso
        titulo="Acesso desativado"
        texto="Seu acesso foi desativado pelo setor de transporte. Procure a administração para reativá-lo."
      />
    )
  }

  if (!perfis.includes(perfil.tipo)) {
    return <Navigate to={rotaInicial(perfil.tipo)} replace />
  }

  if (pagina && !podeAcessar(pagina)) {
    // Sem permissão nesta página, cai na primeira que o administrador liberou.
    const primeira = PAGINAS.find((p) => permissoes.includes(p.chave))
    if (primeira && primeira.caminho !== local.pathname) {
      return <Navigate to={primeira.caminho} replace />
    }
    return (
      <Aviso
        titulo="Sem permissão"
        texto="Seu perfil não tem acesso a esta página. Peça ao administrador para liberá-la em Funcionários."
      />
    )
  }

  return <>{children}</>
}

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted">
      <div className="flex flex-col items-center gap-3">
        <span className="animate-pulse text-primary">
          <IconeOnibus size={30} />
        </span>
        <span className="text-[13px]">Carregando…</span>
      </div>
    </div>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-[17px] font-semibold">{titulo}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{texto}</p>
      </div>
    </div>
  )
}
