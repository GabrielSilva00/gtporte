import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../../lib/supabase'
import { badgeDocumental, dataExtenso, hora, horaCurta } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { CarregandoCards, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import {
  IconeAlerta,
  IconeCheck,
  IconeInfo,
  IconeMotorista,
  IconeRelogio,
  IconeSeta,
  IconeVeiculo,
} from '../../components/icons'
import {
  ROTULO_PERFIL_USO,
  ROTULO_SITUACAO_OPERACIONAL,
  type AvisoRota,
  type MinhaRota as MinhaRotaTipo,
  type SituacaoOperacional,
} from '../../lib/types'

const COR_SITUACAO: Record<SituacaoOperacional, { bg: string; fg: string }> = {
  aguardando: { bg: '#FBEEDA', fg: '#8A5A15' },
  em_rota: { bg: '#EAF3EC', fg: '#2E7D5A' },
  concluida: { bg: '#EEF1EF', fg: '#6B7570' },
}

/** RF11 + RF13/RF14 — rota atribuída e confirmação de presença. */
export default function MinhaRota() {
  const qc = useQueryClient()
  const toast = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['minha-rota'],
    queryFn: async () => {
      const { data: r, error: err } = await supabase.rpc('minha_rota')
      if (err) throw err
      return r as MinhaRotaTipo | null
    },
    refetchInterval: 60_000,
  })

  // RF16 — avisos publicados pelo motorista da rota
  const { data: avisos } = useQuery({
    queryKey: ['avisos-estudante', data?.rota?.id],
    enabled: !!data?.rota?.id,
    queryFn: async () => {
      const { data: r, error: err } = await supabase
        .from('aviso_rota')
        .select('*')
        .eq('rota_id', data!.rota!.id)
        .order('criado_em', { ascending: false })
        .limit(5)
      if (err) throw err
      return r as AvisoRota[]
    },
    refetchInterval: 60_000,
  })

  // RF15 — última posição registrada pelo motorista
  const { data: localizacao } = useQuery({
    queryKey: ['localizacao-estudante', data?.rota?.id],
    enabled: !!data?.rota?.id && data?.rota?.situacao_operacional === 'em_rota',
    queryFn: async () => {
      const { data: r, error: err } = await supabase.rpc('ultima_localizacao', {
        p_rota_id: data!.rota!.id,
      })
      if (err) throw err
      const linha = (r as { latitude: number; longitude: number; registrado_em: string }[])[0]
      return linha ?? null
    },
    refetchInterval: 30_000,
  })

  const confirmar = useMutation({
    mutationFn: async (trecho: 'ida' | 'volta') => {
      const { data: r, error: err } = await supabase.rpc('confirmar_presenca', {
        p_estudante_id: data?.estudante.id ?? null,
        p_trecho: trecho,
      })
      if (err) throw err
      return r as { mensagem: string }
    },
    onSuccess: (r) => {
      toast.sucesso(r.mensagem)
      qc.invalidateQueries({ queryKey: ['minha-rota'] })
      qc.invalidateQueries({ queryKey: ['meu-historico'] })
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (isLoading) return <CarregandoCards itens={2} altura={200} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (!data) return <Vazio titulo="Cadastro não encontrado" />

  const { estudante, alocacao, rota, presenca_hoje: presenca } = data
  const perfilUso = estudante.perfil_uso
  const aprovado = estudante.status_documental === 'aprovado'

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
          Olá, {estudante.nome.split(' ')[0]}
        </h1>
        <div className="mt-1 text-[13px] text-muted">{dataExtenso()}</div>
      </div>

      {/* Situação documental (RN01) */}
      <div className="card mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div>
          <div className="text-[11.5px] text-muted">Situação documental</div>
          <div className="mt-1">
            <Badge estilo={badgeDocumental(estudante.status_documental)} />
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Prontuário</div>
          <div className="mt-1 font-mono text-[13px]">{estudante.prontuario}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Universidade</div>
          <div className="mt-1 text-[13px]">{estudante.universidade ?? '-'}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Perfil de uso</div>
          <div className="mt-1 text-[13px]">{ROTULO_PERFIL_USO[perfilUso]}</div>
        </div>
      </div>

      {!aprovado && (
        <div className="mb-3.5 flex items-start gap-3 rounded-card bg-bg-warn px-4 py-3.5">
          <span className="mt-px shrink-0 text-warn">
            <IconeRelogio size={16} />
          </span>
          <div className="text-[12.5px] leading-relaxed" style={{ color: '#8A5A15' }}>
            {estudante.status_documental === 'rejeitado' ? (
              <>
                Um ou mais documentos foram <b>rejeitados</b>. Veja o motivo na aba{' '}
                <b>Documentos</b> e reenvie para voltar à fila de alocação.
              </>
            ) : (
              <>
                Sua documentação está em <b>análise</b>. A alocação em uma rota só acontece após a
                aprovação pelo setor de transporte.
              </>
            )}
          </div>
        </div>
      )}

      {/* Sem rota */}
      {!rota && (
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tint text-muted">
            <IconeAlerta size={22} />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold">
            {alocacao?.situacao === 'fila_espera'
              ? 'Você está na fila de espera'
              : alocacao?.situacao === 'sem_rota'
                ? 'Nenhuma rota compatível'
                : 'Você ainda não tem rota atribuída'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {alocacao?.motivo
              ? alocacao.motivo
              : aprovado
                ? 'Assim que a próxima distribuição for executada, sua rota aparece aqui.'
                : 'A alocação acontece depois que seus documentos forem aprovados.'}
          </p>
        </div>
      )}

      {/* Rota atribuída */}
      {rota && (
        <>
          <div className="card mb-3.5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-primary">
                    {rota.codigo}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-[3px] font-mono text-[10.5px] tracking-[0.04em]"
                    style={{
                      background: COR_SITUACAO[rota.situacao_operacional].bg,
                      color: COR_SITUACAO[rota.situacao_operacional].fg,
                    }}
                  >
                    {ROTULO_SITUACAO_OPERACIONAL[rota.situacao_operacional].toUpperCase()}
                  </span>
                </div>
                <div className="mt-1 text-[16px] font-semibold">{rota.nome}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-btn bg-tint p-3.5">
              <div className="flex-1">
                <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Ida</div>
                <div className="mt-0.5 text-[13px] font-medium">{rota.origem ?? '-'}</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold text-primary">
                  {hora(rota.horario_partida)}
                </div>
              </div>
              <span className="text-accent">
                <IconeSeta size={18} />
              </span>
              <div className="flex-1 text-right">
                <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Volta</div>
                <div className="mt-0.5 text-[13px] font-medium">{rota.destino ?? '-'}</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold text-primary">
                  {hora(rota.horario_retorno)}
                </div>
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-tint text-primary">
                  <IconeMotorista size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">
                    Motorista
                  </div>
                  <div className="truncate text-[13px] font-medium">{rota.motorista ?? '-'}</div>
                  {rota.motorista_telefone && (
                    <a
                      href={`tel:${rota.motorista_telefone.replace(/\D/g, '')}`}
                      className="font-mono text-[11.5px] text-primary hover:underline"
                    >
                      {rota.motorista_telefone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-tint text-primary">
                  <IconeVeiculo size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted">Veículo</div>
                  <div className="font-mono text-[13px] font-medium">{rota.veiculo ?? '-'}</div>
                  <div className="truncate text-[11.5px] text-soft">{rota.veiculo_modelo}</div>
                </div>
              </div>
            </div>

            {/* RF15 — posição em tempo real */}
            {localizacao && (
              <a
                href={`https://www.google.com/maps?q=${localizacao.latitude},${localizacao.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3.5 flex items-center justify-between rounded-btn border border-edge px-3.5 py-2.5 text-[12.5px] hover:border-primary/40"
              >
                <span>
                  Ônibus em rota · última posição às {horaCurta(localizacao.registrado_em)}
                </span>
                <span className="font-medium text-primary">Ver no mapa →</span>
              </a>
            )}
          </div>

          {/* RF13 / RF14 — confirmação de presença */}
          <div className="card mb-3.5 p-5">
            <div className="mb-1 text-[14.5px] font-semibold">Confirmar presença de hoje</div>
            <p className="mb-4 text-[12px] text-muted">
              A confirmação de ida e a de volta são independentes.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BotaoPresenca
                titulo="Embarque de ida"
                horario={hora(rota.horario_partida)}
                confirmado={!!presenca?.confirmou_ida}
                hora={presenca?.hora_ida}
                indisponivel={perfilUso === 'somente_volta'}
                textoIndisponivel="Não se aplica ao seu perfil"
                carregando={confirmar.isPending}
                onConfirmar={() => confirmar.mutate('ida')}
              />
              <BotaoPresenca
                titulo="Embarque de volta"
                horario={hora(rota.horario_retorno)}
                confirmado={!!presenca?.confirmou_volta}
                hora={presenca?.hora_volta}
                indisponivel={perfilUso === 'somente_ida'}
                textoIndisponivel="Não se aplica ao seu perfil"
                carregando={confirmar.isPending}
                onConfirmar={() => confirmar.mutate('volta')}
              />
            </div>

            {perfilUso === 'ida_volta' && !presenca?.confirmou_ida && (
              <div className="mt-3.5 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
                <span className="mt-px shrink-0 text-primary">
                  <IconeInfo size={15} />
                </span>
                Se você não confirmar a ida, a volta só é liberada com antecedência mínima e se
                houver assento remanescente.
              </div>
            )}
          </div>

          {/* RF16 — avisos do motorista */}
          {avisos && avisos.length > 0 && (
            <div className="card p-5">
              <div className="mb-3 text-[14.5px] font-semibold">Avisos do motorista</div>
              <div className="flex flex-col gap-2.5">
                {avisos.map((a) => (
                  <div key={a.id} className="rounded-btn bg-tint px-3.5 py-3">
                    <div className="text-[12.5px] leading-relaxed">{a.mensagem}</div>
                    <div className="mt-1.5 font-mono text-[10.5px] text-soft">
                      {new Date(a.criado_em).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface BotaoPresencaProps {
  titulo: string
  horario: string
  confirmado: boolean
  hora?: string | null
  indisponivel: boolean
  textoIndisponivel: string
  carregando: boolean
  onConfirmar: () => void
}

function BotaoPresenca({
  titulo,
  horario,
  confirmado,
  hora,
  indisponivel,
  textoIndisponivel,
  carregando,
  onConfirmar,
}: BotaoPresencaProps) {
  if (indisponivel) {
    return (
      <div className="rounded-field border border-dashed border-edge px-4 py-4">
        <div className="text-[13px] font-medium text-soft">{titulo}</div>
        <div className="mt-1 text-[12px] text-soft">{textoIndisponivel}</div>
      </div>
    )
  }

  if (confirmado) {
    return (
      <div className="rounded-field border border-success bg-bg-success px-4 py-4">
        <div className="flex items-center gap-2 text-success">
          <IconeCheck size={16} />
          <span className="text-[13px] font-medium">{titulo} confirmado</span>
        </div>
        <div className="mt-1 font-mono text-[11.5px] text-muted">
          às {horaCurta(hora)} · partida {horario}
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={onConfirmar}
      disabled={carregando}
      className="rounded-field border border-edge px-4 py-4 text-left transition-colors hover:border-primary hover:bg-tint disabled:opacity-60"
    >
      <div className="text-[13px] font-medium">{titulo}</div>
      <div className="mt-1 font-mono text-[11.5px] text-muted">partida {horario}</div>
      <div className="mt-2 text-[12px] font-medium text-primary">Confirmar →</div>
    </button>
  )
}
