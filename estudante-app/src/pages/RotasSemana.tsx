import { useState } from 'react'
import { Bus, ChevronRight, Clock, GraduationCap, MapPin, Phone, Users } from 'lucide-react'
import { useRotasSemana, NOME_DIA, type RotaDoDia } from '@/hooks/useRotasSemana'
import { Spinner } from '@/components/Spinner'

const SITUACAO: Record<string, { texto: string; cls: string }> = {
  aguardando: { texto: 'Ônibus ainda não saiu', cls: 'chip-warn' },
  em_rota: { texto: 'Motorista a caminho', cls: 'chip-ok' },
  concluida: { texto: 'Trajeto concluído', cls: 'chip-info' },
}

const hm = (h: string | null) => (h ? h.slice(0, 5) : '—')

/**
 * Rotas da semana. Desde a alocacao por dia (0022) cada dia pode cair em
 * uma rota diferente; so a rota do dia corrente fica operavel, os demais
 * dias aparecem para consulta.
 */
export function RotasSemana({ onAbrir }: { onAbrir: (dia: RotaDoDia) => void }) {
  const { dias, hoje, loading } = useRotasSemana()
  const [soHoje, setSoHoje] = useState(false)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  const lista = soHoje ? dias.filter((d) => d.eh_hoje) : dias.filter((d) => d.hora_inicio_aula || d.rota_id)

  return (
    <div className="space-y-3 px-4 pb-10 pt-16">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Minhas rotas</h2>
          <p className="text-xs text-muted">
            {soHoje ? 'Somente o dia de hoje' : 'Sua semana, dia a dia'}
          </p>
        </div>
        <button
          onClick={() => setSoHoje((v) => !v)}
          className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
            soHoje ? 'bg-brand-600 text-white' : 'bg-raised/70 text-muted'
          }`}
        >
          {soHoje ? 'Ver a semana' : 'Só hoje'}
        </button>
      </div>

      {lista.length === 0 && (
        <div className="card-flat py-10 text-center">
          <Bus className="mx-auto mb-3 h-10 w-10 text-faint/50" />
          <p className="text-sm text-muted">
            {soHoje ? 'Você não tem aula hoje.' : 'Nenhuma rota nesta semana.'}
          </p>
          <p className="mt-1 text-xs text-faint">
            As rotas aparecem depois que a secretaria aprovar seus documentos e sua grade.
          </p>
        </div>
      )}

      {lista.map((d, i) => {
        const temRota = !!d.rota_id
        const operavel = d.eh_hoje && temRota
        const sit = d.situacao_operacional ? SITUACAO[d.situacao_operacional] : null

        return (
          <button
            key={d.dia_semana}
            onClick={() => temRota && onAbrir(d)}
            disabled={!temRota}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`card anim-in w-full text-left transition-transform ${
              temRota ? 'active:scale-[0.99]' : 'opacity-70'
            } ${d.eh_hoje ? 'border-brand-500/50 ring-1 ring-brand-500/20' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{NOME_DIA[d.dia_semana]}</span>
                {d.eh_hoje && <span className="chip-info px-2 py-0.5 text-[10px]">Hoje</span>}
              </div>
              {operavel && sit && <span className={sit.cls}>{sit.texto}</span>}
            </div>

            {temRota ? (
              <>
                <p className="mt-1.5 text-[13px] font-semibold text-brand-500">
                  {d.codigo} · {d.nome}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {d.origem} &rarr; {d.destino}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {hm(d.horario_partida)} / {hm(d.horario_retorno)}
                  </span>
                  {d.hora_inicio_aula && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      aula {hm(d.hora_inicio_aula)}–{hm(d.hora_fim_aula)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-faint">
                    {d.eh_hoje ? 'Toque para abrir e confirmar presença' : 'Toque para ver detalhes'}
                  </span>
                  <ChevronRight className="h-4 w-4 text-faint" />
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {d.situacao === 'fila_espera'
                  ? 'Na fila de espera para este dia.'
                  : d.situacao === 'sem_rota'
                    ? d.motivo ?? 'Sem rota compatível neste dia.'
                    : d.hora_inicio_aula
                      ? 'Aguardando alocação para este dia.'
                      : 'Sem aula neste dia.'}
              </p>
            )}
          </button>
        )
      })}

      {!soHoje && hoje && !hoje.rota_id && (
        <p className="px-1 text-[11px] text-faint">
          Apenas a rota do dia fica operável. Nos demais dias você consulta, mas confirma presença
          somente no dia.
        </p>
      )}
    </div>
  )
}

export function ResumoPassageiros({ quantidade }: { quantidade: number }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted">
      <Users className="h-3 w-3" />
      {quantidade} passageiro(s)
    </span>
  )
}

export function ContatoMotorista({ telefone }: { telefone: string }) {
  return (
    <a href={`tel:${telefone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-[11px] text-brand-500 underline">
      <Phone className="h-3 w-3" />
      {telefone}
    </a>
  )
}
