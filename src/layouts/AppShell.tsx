import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { Avatar } from '../components/ui/Avatar'
import { ROTULO_TIPO_PERFIL } from '../lib/types'
import {
  IconeAlocacao,
  IconeBusca,
  IconeDashboard,
  IconeDocumento,
  IconeEquipe,
  IconeEstudante,
  IconeMotorista,
  IconeOnibus,
  IconePresenca,
  IconeRelatorio,
  IconeRota,
  IconeSair,
  IconeSino,
  IconeUniversidade,
  IconeVeiculo,
} from '../components/icons'

interface ItemNav {
  para: string
  rotulo: string
  Icone: typeof IconeDashboard
  badge?: number
}

const TITULOS: Record<string, string> = {
  '/': 'Visão geral',
  '/estudantes': 'Estudantes',
  '/documentos': 'Documentos',
  '/alocacao': 'Alocação',
  '/rotas': 'Rotas',
  '/veiculos': 'Veículos',
  '/motoristas': 'Motoristas',
  '/universidades': 'Universidades',
  '/presenca': 'Presença',
  '/relatorios': 'Relatórios',
  '/funcionarios': 'Funcionários',
}

export default function AppShell() {
  const { perfil, sair } = useAuth()
  const navegar = useNavigate()
  const local = useLocation()
  const [busca, setBusca] = useState('')

  // Badges do menu: documentos pendentes e estudantes sem rota (RF03/RF09)
  const { data: contadores } = useQuery({
    queryKey: ['contadores-nav'],
    queryFn: async () => {
      const [docs, semRota] = await Promise.all([
        supabase.from('documento').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase
          .from('alocacao_estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .in('situacao', ['fila_espera', 'sem_rota']),
      ])
      return { documentos: docs.count ?? 0, pendencias: semRota.count ?? 0 }
    },
    refetchInterval: 60_000,
  })

  const secoes = useMemo<{ titulo: string; itens: ItemNav[] }[]>(
    () => [
      {
        titulo: 'Operação',
        itens: [
          { para: '/', rotulo: 'Visão geral', Icone: IconeDashboard },
          { para: '/alocacao', rotulo: 'Alocação', Icone: IconeAlocacao, badge: contadores?.pendencias },
          { para: '/presenca', rotulo: 'Presença', Icone: IconePresenca },
          { para: '/rotas', rotulo: 'Rotas', Icone: IconeRota },
        ],
      },
      {
        titulo: 'Cadastros',
        itens: [
          { para: '/estudantes', rotulo: 'Estudantes', Icone: IconeEstudante },
          { para: '/veiculos', rotulo: 'Veículos', Icone: IconeVeiculo },
          { para: '/motoristas', rotulo: 'Motoristas', Icone: IconeMotorista },
          { para: '/universidades', rotulo: 'Universidades', Icone: IconeUniversidade },
        ],
      },
      {
        titulo: 'Administração',
        itens: [
          { para: '/documentos', rotulo: 'Documentos', Icone: IconeDocumento, badge: contadores?.documentos },
          { para: '/relatorios', rotulo: 'Relatórios', Icone: IconeRelatorio },
          { para: '/funcionarios', rotulo: 'Funcionários', Icone: IconeEquipe },
        ],
      },
    ],
    [contadores],
  )

  function submeterBusca(e: React.FormEvent) {
    e.preventDefault()
    if (!busca.trim()) return
    navegar(`/estudantes?q=${encodeURIComponent(busca.trim())}`)
  }

  async function sairDoSistema() {
    await sair()
    navegar('/login', { replace: true })
  }

  const titulo = TITULOS[local.pathname] ?? ''

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col bg-primary text-[#DDD8CB] md:flex">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 pb-[18px] pt-[22px]">
          <IconeOnibus size={26} />
          <div>
            <div className="text-[14.5px] font-semibold tracking-[0.01em]">GTPORTE</div>
            <div className="mt-px font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
              v1.0 · Araçatuba
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5">
          {secoes.map((sec) => (
            <div key={sec.titulo}>
              <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.14em] opacity-50">
                {sec.titulo}
              </div>
              <div className="flex flex-col gap-px">
                {sec.itens.map(({ para, rotulo, Icone, badge }) => (
                  <NavLink
                    key={para}
                    to={para}
                    end={para === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-[11px] rounded-field px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                        isActive
                          ? 'bg-accent/15 font-semibold text-[#F5F3EE]'
                          : 'font-normal text-[#DDD8CB] hover:bg-white/5'
                      }`
                    }
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center">
                      <Icone size={17} />
                    </span>
                    <span className="flex-1">{rotulo}</span>
                    {!!badge && badge > 0 && (
                      <span className="rounded-full bg-accent px-1.5 py-px font-mono text-[10.5px] font-medium text-white">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3.5">
          <Avatar nome={perfil?.nome ?? '?'} tamanho={32} cor="#C4633A" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{perfil?.nome ?? '—'}</div>
            <div className="text-[10.5px] opacity-60">
              {perfil ? ROTULO_TIPO_PERFIL[perfil.tipo] : ''}
            </div>
          </div>
          <button
            onClick={sairDoSistema}
            title="Sair"
            aria-label="Sair"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#DDD8CB] hover:bg-white/10"
          >
            <IconeSair size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[60px] items-center gap-4 border-b border-edge bg-bg px-5 md:px-[30px]">
          <div className="text-[14px] font-semibold">{titulo}</div>
          <div className="flex-1" />

          <form
            onSubmit={submeterBusca}
            className="hidden w-[280px] items-center gap-2 rounded-btn border border-edge bg-surface px-[11px] py-1.5 lg:flex"
          >
            <span className="text-soft">
              <IconeBusca size={14} />
            </span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar estudante…"
              className="flex-1 border-none bg-transparent text-[13px] outline-none placeholder:text-soft"
            />
          </form>

          <button
            className="relative flex h-[34px] w-[34px] items-center justify-center rounded-btn border border-edge bg-surface"
            title="Notificações"
            aria-label="Notificações"
            onClick={() => navegar('/documentos')}
          >
            <IconeSino size={15} />
            {!!contadores?.documentos && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 pb-16 pt-6 md:px-[30px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
