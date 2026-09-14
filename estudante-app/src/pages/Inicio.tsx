import { useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Bus,
  Check,
  ChevronRight,
  Clock,
  FileWarning,
  MapPin,
  Megaphone,
} from 'lucide-react'
import { useMinhaRota, useDocumentos, confirmarPresenca, ROTULO_DOC } from '@/hooks/useEstudante'
import { useComunicados, type Prioridade } from '@/hooks/useComunicados'
import { Spinner } from '@/components/Spinner'
import { ModalQr } from '@/components/QrEmbarque'
import { QrCode } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Tab } from '@/components/BottomNav'

/** Texto da situacao operacional, do ponto de vista de quem espera o onibus. */
const SITUACAO: Record<string, { texto: string; detalhe: string; cls: string }> = {
  aguardando: {
    texto: 'Ônibus ainda não saiu',
    detalhe: 'O motorista ainda não iniciou o trajeto de hoje.',
    cls: 'chip-warn',
  },
  em_rota: {
    texto: 'Motorista a caminho',
    detalhe: 'O trajeto já começou. Fique atento ao ponto de embarque.',
    cls: 'chip-ok',
  },
  concluida: {
    texto: 'Trajeto concluído',
    detalhe: 'A rota de hoje já foi encerrada pelo motorista.',
    cls: 'chip-info',
  },
}

const COR_PRIORIDADE: Record<Prioridade, string> = {
  urgente: 'border-err/40 bg-err/5',
  importante: 'border-warn/40 bg-warn/5',
  normal: 'border-line/60 bg-surface',
}

/**
 * Visao geral do dia: quem e o aluno, como esta a rota agora, o que ele
 * precisa resolver (documento pendente ou recusado) e o atalho para
 * confirmar presenca sem passar por outra aba.
 */
export function Inicio({ estudanteId, onIr }: { estudanteId: string; onIr: (t: Tab) => void }) {
  const { rota: data, loading, refresh } = useMinhaRota()
  const { docs, loading: carregandoDocs } = useDocumentos(estudanteId)
  const { comunicados, loading: carregandoAvisos } = useComunicados()
  const [busy, setBusy] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [qr, setQr] = useState<'ida' | 'volta' | null>(null)

  if (loading) {
    return (
      <div className="flex justify-center pt-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const est = data?.estudante
  const rota = data?.rota
  const pres = data?.presenca_hoje
  const situacao = rota ? SITUACAO[rota.situacao_operacional] ?? SITUACAO.aguardando : null

  const recusados = docs.filter((d) => d.status === 'rejeitado')
  const faltando = (['rg', 'cpf', 'matricula', 'residencia'] as const).filter(
    (t) => !docs.some((d) => d.tipo === t),
  )

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const confirmar = async (trecho: 'ida' | 'volta') => {
    setBusy(trecho)
    try {
      await confirmarPresenca(trecho)
      toast('Presença confirmada!')
      await refresh()
      // O aluno precisa do codigo na mao logo depois de confirmar.
      if (est?.prontuario) setQr(trecho)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  const fmtHora = (h: string | null) => (h ? h.slice(0, 5) : '')

  return (
    <div className="space-y-4 px-4 pb-24 pt-16">
      {/* Identificacao */}
      <div className="anim-in">
        <p className="text-sm text-muted">{saudacao},</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {(est?.nome ?? '').split(' ')[0] || 'Estudante'}
        </h1>
        {est?.prontuario && (
          <p className="mt-0.5 font-mono text-xs text-muted">Prontuário {est.prontuario}</p>
        )}
      </div>

      {/* Alertas que exigem acao */}
      {est && est.status_documental !== 'aprovado' && (
        <button onClick={() => onIr('documentos')} className="aviso-warn w-full text-left anim-in">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warn">
              Documentação {est.status_documental === 'pendente' ? 'em análise' : 'com pendências'}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {recusados.length > 0
                ? `${recusados.length} documento(s) recusado(s). Toque para reenviar.`
                : faltando.length > 0
                  ? `Falta enviar: ${faltando.map((t) => ROTULO_DOC[t]).join(', ')}.`
                  : 'Sua alocação depende da aprovação dos documentos.'}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        </button>
      )}

      {recusados.length > 0 &&
        recusados.map((d) => (
          <button
            key={d.id}
            onClick={() => onIr('documentos')}
            className="aviso-err w-full text-left anim-in"
          >
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-err">{ROTULO_DOC[d.tipo]} recusado</p>
              {d.observacao && <p className="mt-0.5 text-xs text-muted">{d.observacao}</p>}
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-err" />
          </button>
        ))}

      {/* Situacao da rota + atalho de presenca */}
      {rota ? (
        <div className="card anim-in space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-brand-500">{rota.codigo}</p>
              <h2 className="truncate text-base font-bold">{rota.nome}</h2>
            </div>
            {situacao && <span className={situacao.cls}>{situacao.texto}</span>}
          </div>

          {situacao && <p className="text-xs text-muted">{situacao.detalhe}</p>}

          <div className="grid grid-cols-2 gap-2 border-t border-line/60 pt-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand-500/60" />
              <span className="truncate">
                {rota.origem} &rarr; {rota.destino}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-brand-500/60" />
              {fmtHora(rota.horario_partida)} / {fmtHora(rota.horario_retorno)}
            </span>
          </div>

          {/* Atalho: confirmar presenca sem sair da visao geral */}
          <div className="flex gap-2">
            {pres?.confirmou_ida ? (
              <button
                onClick={() => est?.prontuario && setQr('ida')}
                className="flex-1 rounded-xl bg-ok/10 py-2.5 text-center transition-transform active:scale-[0.98]"
              >
                <Check className="mx-auto h-4 w-4 text-ok" />
                <p className="mt-0.5 text-[11px] font-semibold text-ok">Ida confirmada</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
                  <QrCode className="h-3 w-3" />
                  ver código
                </p>
              </button>
            ) : (
              <button
                onClick={() => confirmar('ida')}
                disabled={!!busy}
                className="btn-success flex-1 py-2.5 text-xs"
              >
                {busy === 'ida' ? <Spinner className="mx-auto h-4 w-4" /> : 'Confirmar ida'}
              </button>
            )}

            {pres?.confirmou_volta ? (
              <button
                onClick={() => est?.prontuario && setQr('volta')}
                className="flex-1 rounded-xl bg-info/10 py-2.5 text-center transition-transform active:scale-[0.98]"
              >
                <Check className="mx-auto h-4 w-4 text-info" />
                <p className="mt-0.5 text-[11px] font-semibold text-info">Volta confirmada</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
                  <QrCode className="h-3 w-3" />
                  ver código
                </p>
              </button>
            ) : (
              <button
                onClick={() => confirmar('volta')}
                disabled={!!busy}
                className="btn-primary flex-1 py-2.5 text-xs"
              >
                {busy === 'volta' ? <Spinner className="mx-auto h-4 w-4" /> : 'Confirmar volta'}
              </button>
            )}
          </div>

          <button
            onClick={() => onIr('rota')}
            className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-brand-500"
          >
            Ver detalhes da rota
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="card anim-in py-8 text-center">
          <Bus className="mx-auto mb-3 h-12 w-12 text-faint/40" />
          <p className="text-sm text-muted">
            {data?.alocacao?.situacao === 'fila_espera'
              ? 'Você está na fila de espera. Aguarde uma vaga.'
              : 'Aguardando alocação em uma rota.'}
          </p>
        </div>
      )}

      {/* Avisos da secretaria */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Megaphone className="h-4 w-4" />
          Avisos da secretaria
        </h3>

        {carregandoAvisos || carregandoDocs ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : comunicados.length === 0 ? (
          <div className="card-flat text-center">
            <Bell className="mx-auto mb-2 h-8 w-8 text-faint/40" />
            <p className="text-xs text-muted">Nenhum aviso no momento.</p>
          </div>
        ) : (
          comunicados.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setAberto(aberto === c.id ? null : c.id)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={`anim-in w-full rounded-2xl border p-4 text-left shadow-card ${COR_PRIORIDADE[c.prioridade]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{c.titulo}</p>
                {c.prioridade !== 'normal' && (
                  <span className={c.prioridade === 'urgente' ? 'chip-err' : 'chip-warn'}>
                    {c.prioridade === 'urgente' ? 'Urgente' : 'Importante'}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-xs text-muted ${aberto === c.id ? '' : 'line-clamp-2'}`}>
                {c.corpo}
              </p>
              <p className="mt-1.5 text-[11px] text-faint">
                {new Date(c.publicado_em).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </button>
          ))
        )}
      </div>

      {qr && est?.prontuario && (
        <ModalQr prontuario={est.prontuario} trecho={qr} onFechar={() => setQr(null)} />
      )}
    </div>
  )
}
