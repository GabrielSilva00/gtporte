import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { useMinhasRotas } from '../../hooks/useMinhasRotas'
import { mensagemErro, supabase } from '../../lib/supabase'
import { CarregandoCards, ErroCarregamento, Vazio } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import { IconeFechar, IconeInfo } from '../../components/icons'
import type { AvisoRota } from '../../lib/types'

const MODELOS = [
  'Saída atrasada em 10 minutos.',
  'Estamos a caminho do ponto de embarque.',
  'Ponto de embarque alterado hoje — confiram o aviso no grupo.',
  'Viagem de volta sairá no horário previsto.',
]

/** RF16 — comunicação do motorista com os passageiros vinculados à rota. */
export default function Avisos() {
  const { perfil } = useAuth()
  const { data: rotas, isLoading: carregandoRotas } = useMinhasRotas()
  const qc = useQueryClient()
  const toast = useToast()

  const [rotaId, setRotaId] = useState('')
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    if (!rotaId && rotas && rotas.length > 0) setRotaId(rotas[0].rota_id)
  }, [rotas, rotaId])

  const { data: avisos, isLoading, error } = useQuery({
    queryKey: ['avisos-motorista', rotaId],
    enabled: !!rotaId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('aviso_rota')
        .select('*')
        .eq('rota_id', rotaId)
        .order('criado_em', { ascending: false })
        .limit(30)
      if (err) throw err
      return data as AvisoRota[]
    },
  })

  const enviar = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.from('aviso_rota').insert({
        rota_id: rotaId,
        autor_id: perfil?.id ?? null,
        mensagem: mensagem.trim(),
      })
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos-motorista'] })
      toast.sucesso('Aviso publicado para os passageiros da rota.')
      setMensagem('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('aviso_rota').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos-motorista'] })
      toast.sucesso('Aviso removido.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (carregandoRotas) return <CarregandoCards itens={2} altura={140} />

  if (rotas && rotas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma rota atribuída a você"
        descricao="Os avisos são enviados aos passageiros de uma rota específica."
      />
    )
  }

  const rota = rotas?.find((r) => r.rota_id === rotaId)

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Avisos aos passageiros</h1>
          <div className="mt-1 text-[13px] text-muted">
            Aparece no painel de quem está alocado nesta rota.
          </div>
        </div>
        {rotas && rotas.length > 1 && (
          <select
            value={rotaId}
            onChange={(e) => setRotaId(e.target.value)}
            className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
          >
            {rotas.map((r) => (
              <option key={r.rota_id} value={r.rota_id}>
                {r.codigo} · {r.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="card mb-4 p-5">
        {rota && (
          <div className="mb-3 text-[12.5px] text-muted">
            Enviando para <b>{rota.passageiros}</b> passageiro(s) da rota{' '}
            <span className="font-mono font-medium text-primary">{rota.codigo}</span>
          </div>
        )}

        <label>
          <span className="field-label">Mensagem</span>
          <textarea
            rows={3}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Ex.: saída atrasada em 10 minutos."
            maxLength={300}
            className="field resize-none"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {MODELOS.map((m) => (
            <button
              key={m}
              onClick={() => setMensagem(m)}
              className="rounded-full border border-edge px-2.5 py-1 text-[11.5px] text-muted hover:border-primary/40 hover:text-ink"
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={() => enviar.mutate()}
          disabled={!mensagem.trim() || enviar.isPending}
          className="btn-primary mt-4 w-full py-2.5"
        >
          {enviar.isPending ? 'Publicando…' : 'Publicar aviso'}
        </button>
      </div>

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoCards itens={2} altura={80} />}

      {avisos && avisos.length > 0 && (
        <>
          <div className="mb-3 text-[14px] font-semibold">Publicados</div>
          <div className="flex flex-col gap-2.5">
            {avisos.map((a) => (
              <div key={a.id} className="card flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] leading-relaxed">{a.mensagem}</div>
                  <div className="mt-1.5 font-mono text-[10.5px] text-soft">
                    {new Date(a.criado_em).toLocaleString('pt-BR')}
                  </div>
                </div>
                <button
                  onClick={() => remover.mutate(a.id)}
                  disabled={remover.isPending}
                  className="shrink-0 text-soft hover:text-danger"
                  aria-label="Remover aviso"
                >
                  <IconeFechar size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {avisos && avisos.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-card bg-tint px-4 py-3.5 text-[12px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          Nenhum aviso publicado nesta rota ainda.
        </div>
      )}
    </div>
  )
}
