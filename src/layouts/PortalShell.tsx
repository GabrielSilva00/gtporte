import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Avatar } from '../components/ui/Avatar'
import { IconeOnibus, IconeSair } from '../components/icons'

export interface ItemPortal {
  para: string
  rotulo: string
  fim?: boolean
}

/**
 * Layout dos painéis do estudante e do motorista. Diferente do AppShell
 * administrativo: navegação horizontal, pensada para uso no celular.
 */
export default function PortalShell({
  titulo,
  itens,
}: {
  titulo: string
  itens: ItemPortal[]
}) {
  const { perfil, sair } = useAuth()
  const navegar = useNavigate()

  async function sairDoSistema() {
    await sair()
    navegar('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 bg-primary text-primary-fg">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-3.5">
          <IconeOnibus size={24} />
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold leading-tight">GTPORTE</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-60">
              {titulo}
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="max-w-[180px] truncate text-[12.5px] font-medium">
              {perfil?.nome ?? '-'}
            </div>
            <div className="text-[10.5px] opacity-60">{perfil?.email}</div>
          </div>
          <Avatar nome={perfil?.nome ?? '?'} tamanho={32} cor="#C4633A" />
          <button
            onClick={sairDoSistema}
            title="Sair"
            aria-label="Sair"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"
          >
            <IconeSair size={16} />
          </button>
        </div>

        <nav className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-4xl gap-1 overflow-x-auto px-3">
            {itens.map((i) => (
              <NavLink
                key={i.para}
                to={i.para}
                end={i.fim}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                    isActive
                      ? 'border-accent font-semibold text-primary-fg'
                      : 'border-transparent text-primary-fg/65 hover:text-primary-fg'
                  }`
                }
              >
                {i.rotulo}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
