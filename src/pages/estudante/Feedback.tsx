import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { mensagemErro, supabase } from '../../lib/supabase'
import { dataBR } from '../../lib/format'
import { CarregandoCards, ErroCarregamento } from '../../components/ui/Estados'
import { useToast } from '../../components/ui/Toast'
import type { Alocacao } from '../../lib/types'

interface FeedbackEnviado {
  id: string
  nota: number
  comentario: string | null
  criado_em: string
  rota: { codigo: string } | null
}

/** RF23 — registro de avaliação do serviço de transporte. */
export default function Feedback() {
  const { estudanteId } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')

  const { data: alocacao } = useQuery({
    queryKey: ['minha-alocacao-ativa', estudanteId],
    enabled: !!estudanteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alocacao_estudante')
        .select('*, rota:rota_id (id, codigo, nome)')
        .eq('estudante_id', estudanteId!)
        .eq('ativa', true)
        .maybeSingle()
      if (error) throw error
      return data as unknown as Alocacao | null
    },
  })

  const { data: enviados, isLoading, error } = useQuery({
    queryKey: ['meus-feedbacks', estudanteId],
    enabled: !!estudanteId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('feedback')
        .select('id, nota, comentario, criado_em, rota:rota_id (codigo)')
        .eq('estudante_id', estudanteId!)
        .order('criado_em', { ascending: false })
      if (err) throw err
      return data as unknown as FeedbackEnviado[]
    },
  })

  const enviar = useMutation({
    mutationFn: async () => {
      if (!estudanteId) throw new Error('Cadastro de estudante não encontrado.')
      const { error: err } = await supabase.from('feedback').insert({
        estudante_id: estudanteId,
        rota_id: alocacao?.rota_id ?? null,
        nota,
        comentario: comentario.trim() || null,
      })
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meus-feedbacks'] })
      toast.sucesso('Obrigado! Sua avaliação foi registrada.')
      setNota(0)
      setComentario('')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (isLoading) return <CarregandoCards itens={2} altura={140} />
  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Avaliar o transporte</h1>
        <div className="mt-1 text-[13px] text-muted">
          Sua avaliação vai para o relatório gerencial do setor de transporte.
        </div>
      </div>

      <div className="card mb-5 p-5">
        {alocacao?.rota && (
          <div className="mb-4 text-[12.5px] text-muted">
            Avaliando a rota{' '}
            <span className="font-mono font-medium text-primary">{alocacao.rota.codigo}</span> ·{' '}
            {alocacao.rota.nome}
          </div>
        )}

        <div className="field-label">Nota</div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setNota(n)}
              aria-label={`Nota ${n}`}
              className={`h-11 w-11 rounded-field border text-[15px] font-semibold transition-colors ${
                nota >= n
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-edge bg-surface text-muted hover:border-primary/40'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11.5px] text-soft">1 = muito ruim · 5 = excelente</div>

        <label className="mt-4 block">
          <span className="field-label">Comentário (opcional)</span>
          <textarea
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Pontualidade, conservação do veículo, atendimento do motorista…"
            className="field resize-none"
          />
        </label>

        <button
          onClick={() => enviar.mutate()}
          disabled={nota === 0 || enviar.isPending}
          className="btn-primary mt-4 w-full py-3"
        >
          {enviar.isPending ? 'Enviando…' : 'Enviar avaliação'}
        </button>
      </div>

      {enviados && enviados.length > 0 && (
        <>
          <div className="mb-3 text-[14px] font-semibold">Avaliações anteriores</div>
          <div className="flex flex-col gap-2.5">
            {enviados.map((f) => (
              <div key={f.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-tint px-2 py-0.5 font-mono text-[12px] font-semibold text-primary">
                      {f.nota}/5
                    </span>
                    {f.rota && (
                      <span className="font-mono text-[11.5px] text-muted">{f.rota.codigo}</span>
                    )}
                  </div>
                  <span className="font-mono text-[10.5px] text-soft">{dataBR(f.criado_em)}</span>
                </div>
                {f.comentario && (
                  <div className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    {f.comentario}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
