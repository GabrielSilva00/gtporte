import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  CalendarClock,
  CircleCheck,
  CircleX,
  FileText,
  History,
  MessageCircle,
  RotateCcw,
  UserCog,
} from 'lucide-react'
import { erroMsg, supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Spinner'
import { ROTULO_CAMPO } from '@/hooks/useAlteracoes'

interface Atividade {
  quando: string
  tipo: string
  titulo: string
  detalhe: string | null
  situacao: string | null
}

const ICONE: Record<string, typeof History> = {
  presenca: CircleCheck,
  cancelamento: CircleX,
  documento: FileText,
  cadastro: UserCog,
  grade: CalendarClock,
  solicitacao: RotateCcw,
  troca: ArrowLeftRight,
  conversa: MessageCircle,
}

const COR: Record<string, string> = {
  presenca: 'bg-ok/10 text-ok',
  cancelamento: 'bg-err/10 text-err',
  documento: 'bg-brand-500/10 text-brand-500',
  cadastro: 'bg-info/10 text-info',
  grade: 'bg-info/10 text-info',
  solicitacao: 'bg-warn/10 text-warn',
  troca: 'bg-warn/10 text-warn',
  conversa: 'bg-brand-500/10 text-brand-500',
}

/** Situacao do registro, do ponto de vista do aluno. */
const SITUACAO: Record<string, { texto: string; cls: string }> = {
  pendente: { texto: 'Em análise', cls: 'chip-warn' },
  aprovado: { texto: 'Aprovado', cls: 'chip-ok' },
  aprovada: { texto: 'Aprovada', cls: 'chip-ok' },
  rejeitado: { texto: 'Recusado', cls: 'chip-err' },
  recusada: { texto: 'Recusada', cls: 'chip-err' },
  humano: { texto: 'Em andamento', cls: 'chip-info' },
  encerrada: { texto: 'Encerrada', cls: 'chip bg-raised text-muted' },
}

const quandoFmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Historico de atividade: presencas, cancelamentos, documentos enviados,
 * alteracoes de cadastro e de grade, pedidos de volta, trocas de onibus e
 * conversas abertas. Vem de atividade_estudante() (0027), a mesma funcao
 * que a secretaria usa para conferir o que o aluno enviou.
 */
export function Historico({ estudanteId }: { estudanteId: string }) {
  const [itens, setItens] = useState<Atividade[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data, error } = await supabase.rpc('atividade_estudante', {
        p_estudante_id: estudanteId,
        p_dias: 30,
      })
      if (!vivo) return
      if (error) setErro(erroMsg(error))
      setItens((data as Atividade[]) ?? [])
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [estudanteId])

  if (loading) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-10 pt-16">
      <div>
        <h2 className="text-lg font-bold">Histórico de atividade</h2>
        <p className="text-xs text-muted">Últimos 30 dias</p>
      </div>

      {erro && (
        <div className="aviso-err">
          <p className="text-xs text-muted">
            <b className="text-err">Não foi possível carregar.</b> {erro}
          </p>
        </div>
      )}

      {itens.length === 0 && !erro ? (
        <div className="flex flex-col items-center py-12 text-center">
          <History className="mb-3 h-12 w-12 text-faint/40" />
          <p className="text-sm text-muted">Nenhuma atividade nos últimos 30 dias</p>
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((a, i) => {
            const Icone = ICONE[a.tipo] ?? History
            const sit = a.situacao ? SITUACAO[a.situacao] : undefined
            return (
              <div
                key={`${a.tipo}-${a.quando}-${i}`}
                className="card anim-in flex items-start gap-3"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${COR[a.tipo] ?? 'bg-raised text-muted'}`}
                >
                  <Icone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{a.titulo}</p>
                    {sit && a.tipo !== 'presenca' && a.tipo !== 'cancelamento' && (
                      <span className={`${sit.cls} shrink-0 px-2 py-0.5 text-[10.5px]`}>
                        {sit.texto}
                      </span>
                    )}
                  </div>
                  {a.detalhe && (
                    <p className="truncate text-xs text-muted">
                      {a.tipo === 'cadastro'
                        ? (ROTULO_CAMPO as Record<string, string>)[a.detalhe] ?? a.detalhe
                        : a.detalhe}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-faint">{quandoFmt(a.quando)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
