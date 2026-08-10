import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { IconeAlocacao, IconeDocumento, IconeRota, IconeSino } from './icons'

interface Pendencia {
  chave: string
  titulo: string
  detalhe: string
  quantidade: number
  destino: string
  Icone: typeof IconeDocumento
  cor: string
  fundo: string
}

/**
 * Pendências que o setor precisa resolver, derivadas do estado atual do banco.
 * Não existe tabela de notificação: cada linha é uma contagem que, quando zera,
 * some do painel.
 */
export function Notificacoes() {
  const navegar = useNavigate()
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['notificacoes'],
    queryFn: async () => {
      const [docs, fila, semRota, lotadas] = await Promise.all([
        supabase
          .from('documento')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pendente'),
        supabase
          .from('alocacao_estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .eq('situacao', 'fila_espera'),
        supabase
          .from('alocacao_estudante')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .eq('situacao', 'sem_rota'),
        supabase.from('rota').select('id', { count: 'exact', head: true }).eq('status', 'lotada'),
      ])

      return {
        documentos: docs.count ?? 0,
        fila: fila.count ?? 0,
        semRota: semRota.count ?? 0,
        lotadas: lotadas.count ?? 0,
      }
    },
    refetchInterval: 60_000,
  })

  // Fecha ao clicar fora ou ao apertar Esc, como qualquer menu suspenso
  useEffect(() => {
    if (!aberto) return

    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const pendencias: Pendencia[] = [
    {
      chave: 'documentos',
      titulo: 'Documentos aguardando validação',
      detalhe: 'Sem a aprovação, o estudante não entra na distribuição.',
      quantidade: data?.documentos ?? 0,
      destino: '/documentos',
      Icone: IconeDocumento,
      cor: '#8A5A15',
      fundo: '#FBEEDA',
    },
    {
      chave: 'fila',
      titulo: 'Estudantes na fila de espera',
      detalhe: 'Há rota compatível, mas o veículo está sem vaga.',
      quantidade: data?.fila ?? 0,
      destino: '/alocacao',
      Icone: IconeAlocacao,
      cor: '#C4633A',
      fundo: '#F4EAE1',
    },
    {
      chave: 'sem_rota',
      titulo: 'Estudantes sem rota compatível',
      detalhe: 'Nenhuma rota atende a universidade e o horário deles.',
      quantidade: data?.semRota ?? 0,
      destino: '/alocacao',
      Icone: IconeAlocacao,
      cor: '#9E3E3E',
      fundo: '#FBECEC',
    },
    {
      chave: 'lotadas',
      titulo: 'Rotas na capacidade máxima',
      detalhe: 'Considere remanejar veículo ou abrir outra rota.',
      quantidade: data?.lotadas ?? 0,
      destino: '/rotas',
      Icone: IconeRota,
      cor: '#1F3A2E',
      fundo: '#EEF1EF',
    },
  ]

  const ativas = pendencias.filter((p) => p.quantidade > 0)
  const total = ativas.reduce((soma, p) => soma + p.quantidade, 0)

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={total > 0 ? `Notificações, ${total} pendências` : 'Notificações'}
        title="Notificações"
        className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-btn border bg-surface transition-colors ${
          aberto ? 'border-primary/40' : 'border-edge hover:border-primary/30'
        }`}
      >
        <IconeSino size={15} />
        {total > 0 && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[330px] overflow-hidden rounded-card border border-edge bg-surface shadow-[0_12px_32px_rgba(27,29,30,0.14)]">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] font-semibold">Notificações</span>
            <span className="font-mono text-[11px] text-soft">
              {ativas.length === 0 ? 'tudo em dia' : `${total} pendência${total > 1 ? 's' : ''}`}
            </span>
          </div>

          {isLoading ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted">Carregando…</div>
          ) : ativas.length === 0 ? (
            <div className="px-4 py-7 text-center">
              <div className="text-[13px] font-medium">Nenhuma pendência</div>
              <p className="mt-1 text-[12px] text-muted">
                Documentos validados e todos os estudantes alocados.
              </p>
            </div>
          ) : (
            <ul>
              {ativas.map((p) => (
                <li key={p.chave} className="border-b border-line last:border-b-0">
                  <button
                    onClick={() => {
                      setAberto(false)
                      navegar(p.destino)
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg"
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]"
                      style={{ background: p.fundo, color: p.cor }}
                    >
                      <p.Icone size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[12.5px] font-medium">{p.titulo}</span>
                        <span
                          className="shrink-0 font-mono text-[12px] font-semibold"
                          style={{ color: p.cor }}
                        >
                          {p.quantidade}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-muted">
                        {p.detalhe}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
