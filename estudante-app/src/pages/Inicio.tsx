import { useState } from 'react'
import {
  AlertTriangle,
  Bus,
  CalendarClock,
  ChevronRight,
  Clock,
  FileText,
  History,
  MapPin,
  MessageCircle,
  QrCode,
  User,
} from 'lucide-react'
import { useMinhaRota, useDocumentos, confirmarPresenca, ROTULO_DOC } from '@/hooks/useEstudante'
import { useGrade } from '@/hooks/useGrade'
import { Spinner } from '@/components/Spinner'
import { ModalQr } from '@/components/QrEmbarque'
import { toast } from '@/components/Toast'
import type { Tab } from '@/lib/navegacao'

/** Situacao operacional no ponto de vista de quem espera o onibus. */
const SITUACAO: Record<string, { texto: string; cls: string }> = {
  aguardando: { texto: 'Ônibus ainda não saiu', cls: 'chip-warn' },
  em_rota: { texto: 'Motorista a caminho', cls: 'chip-ok' },
  concluida: { texto: 'Trajeto concluído', cls: 'chip-info' },
}

/**
 * Cards de navegacao da tela inicial. Os avisos da secretaria sairam
 * daqui: vivem no sino de notificacoes, junto com o resto.
 */
const ATALHOS: { id: Tab; titulo: string; descricao: string; icone: typeof Bus; cor: string }[] = [
  {
    id: 'documentos',
    titulo: 'Documentos',
    descricao: 'Envie e acompanhe a validação',
    icone: FileText,
    cor: 'from-brand-600 to-brand-500',
  },
  {
    id: 'rota',
    titulo: 'Minha Rota',
    descricao: 'Horários, motorista e presença',
    icone: Bus,
    cor: 'from-ok to-ok/70',
  },
  {
    id: 'feedback',
    titulo: 'Mensagens',
    descricao: 'Fale com a secretaria ou o motorista',
    icone: MessageCircle,
    cor: 'from-info to-info/70',
  },
  {
    id: 'historico',
    titulo: 'Histórico',
    descricao: 'Suas viagens dos últimos 30 dias',
    icone: History,
    cor: 'from-warn to-warn/70',
  },
  {
    id: 'perfil',
    titulo: 'Perfil',
    descricao: 'Seus dados e grade de aulas',
    icone: User,
    cor: 'from-faint to-muted',
  },
]

export function Inicio({ estudanteId, onIr }: { estudanteId: string; onIr: (t: Tab) => void }) {
  const { rota: data, loading, refresh } = useMinhaRota()
  const { docs } = useDocumentos(estudanteId)
  const { vazia: gradeVazia, loading: carregandoGrade } = useGrade(estudanteId)
  const [busy, setBusy] = useState<string | null>(null)
  const [qr, setQr] = useState<'ida' | 'volta' | null>(null)

  if (loading) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const est = data?.estudante
  const rota = data?.rota
  const pres = data?.presenca_hoje
  const situacao = rota ? SITUACAO[rota.situacao_operacional] ?? SITUACAO.aguardando : null
  const recusados = docs.filter((d) => d.status === 'rejeitado')

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const confirmar = async (trecho: 'ida' | 'volta') => {
    setBusy(trecho)
    try {
      await confirmarPresenca(trecho)
      toast('Presença confirmada!')
      await refresh()
      if (est?.prontuario) setQr(trecho)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  const fmtHora = (h: string | null) => (h ? h.slice(0, 5) : '')

  return (
    <div className="space-y-4 px-4 pb-10 pt-16">
      <div className="anim-in">
        <p className="text-sm text-muted">{saudacao},</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {(est?.nome ?? '').split(' ')[0] || 'Estudante'}
        </h1>
      </div>

      {est && est.status_documental !== 'aprovado' && (
        <button onClick={() => onIr('documentos')} className="aviso-warn anim-in w-full text-left">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warn">
              Documentação {est.status_documental === 'pendente' ? 'em análise' : 'com pendências'}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {recusados.length > 0
                ? `${recusados.map((d) => ROTULO_DOC[d.tipo]).join(', ')} recusado(s). Toque para reenviar.`
                : 'Sua alocação depende da aprovação dos documentos.'}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        </button>
      )}

      {!carregandoGrade && gradeVazia && (
        <button onClick={() => onIr('perfil')} className="aviso-warn anim-in w-full text-left">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warn">Grade de aulas não informada</p>
            <p className="mt-0.5 text-xs text-muted">
              Sem seus horários não é possível achar um ônibus compatível.
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        </button>
      )}

      {/* Rota do dia — presente, porem discreta: o detalhe fica na aba Rota. */}
      {rota ? (
        <div className="card anim-in space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Bus className="h-4 w-4 shrink-0 text-brand-500" />
              <span className="truncate text-sm font-semibold">
                {rota.codigo} · {rota.nome}
              </span>
            </div>
            {situacao && <span className={situacao.cls}>{situacao.texto}</span>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {rota.origem} &rarr; {rota.destino}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtHora(rota.horario_partida)} / {fmtHora(rota.horario_retorno)}
            </span>
          </div>

          <div className="flex gap-2">
            {pres?.confirmou_ida ? (
              <button
                onClick={() => est?.prontuario && setQr('ida')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ok/10 py-2 text-[11px] font-semibold text-ok"
              >
                <QrCode className="h-3.5 w-3.5" />
                Ida — ver código
              </button>
            ) : (
              <button
                onClick={() => confirmar('ida')}
                disabled={!!busy}
                className="flex-1 rounded-lg bg-ok/10 py-2 text-[11px] font-semibold text-ok"
              >
                {busy === 'ida' ? <Spinner className="mx-auto h-4 w-4" /> : 'Confirmar ida'}
              </button>
            )}

            {pres?.confirmou_volta ? (
              <button
                onClick={() => est?.prontuario && setQr('volta')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-info/10 py-2 text-[11px] font-semibold text-info"
              >
                <QrCode className="h-3.5 w-3.5" />
                Volta — ver código
              </button>
            ) : (
              <button
                onClick={() => confirmar('volta')}
                disabled={!!busy}
                className="flex-1 rounded-lg bg-brand-600/10 py-2 text-[11px] font-semibold text-brand-500"
              >
                {busy === 'volta' ? <Spinner className="mx-auto h-4 w-4" /> : 'Confirmar volta'}
              </button>
            )}
          </div>

          <button
            onClick={() => onIr('rota')}
            className="flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-brand-500"
          >
            Ver detalhes da rota
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="card-flat anim-in flex items-center gap-3">
          <Bus className="h-8 w-8 shrink-0 text-faint/50" />
          <p className="text-xs text-muted">
            {data?.alocacao?.situacao === 'fila_espera'
              ? 'Você está na fila de espera. Aguarde uma vaga.'
              : 'Aguardando alocação em uma rota.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ATALHOS.map((a, i) => (
          <button
            key={a.id}
            onClick={() => onIr(a.id)}
            style={{ animationDelay: `${i * 45}ms` }}
            className={`anim-in flex items-center gap-3 rounded-xl bg-gradient-to-br ${a.cor} p-4 text-left text-white shadow-card transition-transform active:scale-[0.98]`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <a.icone className="h-[22px] w-[22px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{a.titulo}</span>
              <span className="block text-[11.5px] text-white/85">{a.descricao}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/70" />
          </button>
        ))}
      </div>

      {qr && est?.prontuario && (
        <ModalQr prontuario={est.prontuario} trecho={qr} onFechar={() => setQr(null)} />
      )}
    </div>
  )
}
