import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { CATEGORIAS, PAGINAS, type ChavePagina } from '../lib/paginas'
import { Avatar } from '../components/ui/Avatar'
import { Notificacoes } from '../components/Notificacoes'
import { ROTULO_TIPO_PERFIL } from '../lib/types'
import {
  IconeBarras,
  IconeBusca,
  IconeChevron,
  IconeOnibus,
  IconeSair,
} from '../components/icons'

const CHAVE_RECOLHIDO = 'gtporte:menu-recolhido'
const CHAVE_ABERTOS = 'gtporte:menu-abertos'

function lerRecolhido(): boolean {
  return localStorage.getItem(CHAVE_RECOLHIDO) === '1'
}

function lerAbertos(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE_ABERTOS)
    if (!bruto) return new Set(CATEGORIAS) // primeira visita: tudo aberto
    return new Set(JSON.parse(bruto) as string[])
  } catch {
    return new Set(CATEGORIAS)
  }
}

export default function AppShell() {
  const { perfil, sair, podeAcessar } = useAuth()
  const navegar = useNavigate()
  const local = useLocation()

  const [busca, setBusca] = useState('')
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  const [abertos, setAbertos] = useState<Set<string>>(lerAbertos)

  useEffect(() => {
    localStorage.setItem(CHAVE_RECOLHIDO, recolhido ? '1' : '0')
  }, [recolhido])

  useEffect(() => {
    localStorage.setItem(CHAVE_ABERTOS, JSON.stringify([...abertos]))
  }, [abertos])

  // Badges do menu: documentos pendentes, estudantes sem rota e mensagens não lidas
  const { data: contadores } = useQuery({
    queryKey: ['contadores-nav'],
    queryFn: async () => {
      const [docs, semRota, solicitacoes, mensagens] = await Promise.all([
        supabase.from('documento').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase
          .from('alocacao_estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .in('situacao', ['fila_espera', 'sem_rota']),
        supabase
          .from('mensagem')
          .select('id', { count: 'exact', head: true })
          .eq('tipo', 'solicitacao')
          .eq('status', 'aberta'),
        supabase
          .from('mensagem')
          .select('id', { count: 'exact', head: true })
          .eq('tipo', 'mensagem')
          .is('lida_em', null),
      ])
      return {
        documentos: docs.count ?? 0,
        alocacao: semRota.count ?? 0,
        solicitacoes: solicitacoes.count ?? 0,
        mensagens: mensagens.count ?? 0,
      }
    },
    refetchInterval: 60_000,
  })

  const badges: Partial<Record<ChavePagina, number | undefined>> = useMemo(
    () => ({
      alocacao: contadores?.alocacao,
      documentos: contadores?.documentos,
      solicitacoes: contadores?.solicitacoes,
      mensagens: contadores?.mensagens,
    }),
    [contadores],
  )

  // Menu montado a partir do catálogo, filtrado pelas permissões do usuário
  const secoes = useMemo(
    () =>
      CATEGORIAS.map((titulo) => ({
        titulo,
        itens: PAGINAS.filter((p) => p.categoria === titulo && podeAcessar(p.chave)),
      })).filter((s) => s.itens.length > 0),
    [podeAcessar],
  )

  function alternarCategoria(titulo: string) {
    setAbertos((atual) => {
      const proxima = new Set(atual)
      if (proxima.has(titulo)) proxima.delete(titulo)
      else proxima.add(titulo)
      return proxima
    })
  }

  function submeterBusca(e: React.FormEvent) {
    e.preventDefault()
    if (!busca.trim()) return
    navegar(`/estudantes?q=${encodeURIComponent(busca.trim())}`)
  }

  async function sairDoSistema() {
    await sair()
    navegar('/login', { replace: true })
  }

  const titulo = PAGINAS.find((p) => p.caminho === local.pathname)?.rotulo ?? ''

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <aside
        className="sticky top-0 hidden h-screen shrink-0 flex-col bg-primary text-[#DDD8CB] transition-[width] duration-200 md:flex"
        style={{ width: recolhido ? 62 : 236 }}
      >
        <div
          className={`flex items-center gap-2.5 border-b border-white/10 pb-[18px] pt-[22px] ${
            recolhido ? 'justify-center px-2' : 'px-5'
          }`}
        >
          {!recolhido && (
            <>
              <IconeOnibus size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold tracking-[0.01em]">GTPORTE</div>
                <div className="mt-px font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
                  Painel de Controle
                </div>
              </div>
            </>
          )}
          <button
            onClick={() => setRecolhido((v) => !v)}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
          >
            <IconeBarras size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5">
          {secoes.map((sec) => {
            const aberta = recolhido || abertos.has(sec.titulo)
            return (
              <div key={sec.titulo}>
                {!recolhido && (
                  <button
                    onClick={() => alternarCategoria(sec.titulo)}
                    aria-expanded={aberta}
                    className="flex w-full items-center gap-1.5 rounded-field px-2.5 pb-1.5 pt-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] opacity-50 transition-opacity hover:opacity-80"
                  >
                    <span className="flex-1">{sec.titulo}</span>
                    <span
                      className="transition-transform"
                      style={{ transform: aberta ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    >
                      <IconeChevron size={12} />
                    </span>
                  </button>
                )}

                {aberta && (
                  <div className={`flex flex-col gap-px ${recolhido ? 'py-1.5' : ''}`}>
                    {sec.itens.map(({ chave, caminho, rotulo, Icone }) => {
                      const badge = badges[chave]
                      return (
                        <NavLink
                          key={caminho}
                          to={caminho}
                          end={caminho === '/'}
                          title={recolhido ? rotulo : undefined}
                          className={({ isActive }) =>
                            `flex items-center gap-[11px] rounded-field py-2 text-left text-[13.5px] transition-colors ${
                              recolhido ? 'justify-center px-0' : 'px-2.5'
                            } ${
                              isActive
                                ? 'bg-accent/15 font-semibold text-[#F5F3EE]'
                                : 'font-normal text-[#DDD8CB] hover:bg-white/5'
                            }`
                          }
                        >
                          <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                            <Icone size={17} />
                            {recolhido && !!badge && badge > 0 && (
                              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />
                            )}
                          </span>
                          {!recolhido && (
                            <>
                              <span className="flex-1">{rotulo}</span>
                              {!!badge && badge > 0 && (
                                <span className="rounded-full bg-accent px-1.5 py-px font-mono text-[10.5px] font-medium text-white">
                                  {badge}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div
          className={`flex items-center gap-2.5 border-t border-white/10 py-3.5 ${
            recolhido ? 'justify-center px-2' : 'px-4'
          }`}
        >
          {!recolhido && (
            <>
              <Avatar nome={perfil?.nome ?? '?'} tamanho={32} cor="#C4633A" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{perfil?.nome ?? '—'}</div>
                <div className="text-[10.5px] opacity-60">
                  {perfil ? ROTULO_TIPO_PERFIL[perfil.tipo] : ''}
                </div>
              </div>
            </>
          )}
          <button
            onClick={sairDoSistema}
            title="Sair"
            aria-label="Sair"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#DDD8CB] hover:bg-white/10"
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

          <Notificacoes />
        </header>

        <div className="flex-1 overflow-auto px-5 pb-16 pt-6 md:px-[30px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
