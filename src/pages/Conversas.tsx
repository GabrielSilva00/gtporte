import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mensagemErro, supabase } from '../lib/supabase'
import { dataHoraBR } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Tabs } from '../components/ui/Tabs'
import { CarregandoTabela, ErroCarregamento, Vazio } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeEnviar } from '../components/icons'

type Aba = 'secretaria' | 'motorista' | 'grupo' | 'motivos'
type Destino = 'secretaria' | 'motorista'

interface ConversaAtendimento {
  id: string
  tipo: 'direta' | 'grupo'
  destino: Destino | null
  situacao: 'bot' | 'humano' | 'encerrada'
  assunto: string | null
  estudante_id: string | null
  estudante_nome: string | null
  prontuario: string | null
  rota: string | null
  motorista: string | null
  criado_em: string
  ultima_em: string
  ultima_msg: string | null
  aguardando: boolean
}

interface MensagemConversa {
  id: string
  autor_id: string | null
  autor_nome: string | null
  autor_tipo: string | null
  eh_bot: boolean
  corpo: string
  criado_em: string
}

interface Motivo {
  id: string
  destino: Destino
  titulo: string
  descricao: string | null
  ordem: number
  ativo: boolean
}

/**
 * Conversas abertas pelo aplicativo do estudante (0024/0027).
 *
 * Antes, o app gravava em `conversa` e o painel só lia a tabela `mensagem`:
 * o que o aluno escrevia não chegava a ninguém. Aqui a secretaria atende as
 * conversas enderaçadas a ela, acompanha as conversas com motoristas e os
 * grupos das rotas, e mantém a lista de motivos que o aluno escolhe ao abrir
 * uma conversa.
 */
export default function Conversas() {
  const [aba, setAba] = useState<Aba>('secretaria')
  const qc = useQueryClient()

  // Mensagem nova em qualquer conversa atualiza lista e fio abertos.
  useEffect(() => {
    const canal = supabase
      .channel('painel-conversas')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversa_mensagem' },
        () => {
          qc.invalidateQueries({ queryKey: ['conversas-atendimento'] })
          qc.invalidateQueries({ queryKey: ['conversa-mensagens'] })
          qc.invalidateQueries({ queryKey: ['contadores-nav'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [qc])

  const { data: secretaria } = useQuery({
    queryKey: ['conversas-atendimento', 'secretaria'],
    queryFn: () => listar('secretaria'),
    refetchInterval: 60_000,
  })
  const aguardando = (secretaria ?? []).filter(
    (c) => c.aguardando && c.situacao !== 'encerrada',
  ).length

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold">Conversas do app</h1>
        <div className="mt-1 text-[13px] text-muted">
          Atendimento aos estudantes pelo aplicativo, conversas com motoristas e grupos das rotas.
        </div>
      </div>

      <Tabs
        abas={[
          { chave: 'secretaria', rotulo: 'Atendimento', contador: aguardando || undefined },
          { chave: 'motorista', rotulo: 'Com motoristas' },
          { chave: 'grupo', rotulo: 'Grupos das rotas' },
          { chave: 'motivos', rotulo: 'Motivos de contato' },
        ]}
        ativa={aba}
        onMudar={setAba}
      />

      <div className="mt-4">
        {aba === 'motivos' ? <Motivos /> : <Caixa key={aba} tipo={aba} />}
      </div>
    </div>
  )
}

async function listar(tipo: Exclude<Aba, 'motivos'>) {
  const { data, error } = await supabase.rpc('conversas_atendimento', {
    p_destino: tipo === 'grupo' ? null : tipo,
  })
  if (error) throw error
  return (data ?? []) as ConversaAtendimento[]
}

function tituloConversa(c: ConversaAtendimento) {
  if (c.tipo === 'grupo') return c.rota ?? 'Grupo da rota'
  return c.estudante_nome ?? 'Estudante removido'
}

/** Lista de conversas à esquerda, fio e resposta à direita. */
function Caixa({ tipo }: { tipo: Exclude<Aba, 'motivos'> }) {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')

  const { data, isLoading, error } = useQuery({
    queryKey: ['conversas-atendimento', tipo],
    queryFn: () => listar(tipo),
    refetchInterval: 60_000,
  })

  const lista = useMemo(
    () => (data ?? []).filter((c) => filtro === 'todas' || c.situacao !== 'encerrada'),
    [data, filtro],
  )
  const selecionada = (data ?? []).find((c) => c.id === selecionadaId) ?? null

  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (isLoading) return <CarregandoTabela linhas={6} />

  return (
    <>
      {tipo !== 'grupo' && (
        <div className="mb-3 flex justify-end">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as 'abertas' | 'todas')}
            className="rounded-btn border border-edge bg-surface px-3 py-2 text-[12.5px]"
          >
            <option value="abertas">Em andamento</option>
            <option value="todas">Todas, inclusive encerradas</option>
          </select>
        </div>
      )}

      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhuma conversa"
          descricao={
            tipo === 'secretaria'
              ? 'Quando um estudante abrir uma conversa com a secretaria pelo app, ela aparece aqui.'
              : tipo === 'motorista'
                ? 'Conversas entre estudantes e motoristas aparecem aqui para acompanhamento.'
                : 'Os grupos são criados quando estudantes validados entram nas rotas.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,360px)_1fr]">
          <div className="card divide-y divide-line overflow-hidden">
            {lista.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelecionadaId(c.id)}
                className={`flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors ${
                  c.id === selecionadaId ? 'bg-tint' : 'hover:bg-bg'
                }`}
              >
                <Avatar nome={tituloConversa(c)} tamanho={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium">{tituloConversa(c)}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-soft">
                      {dataHoraBR(c.ultima_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {c.aguardando && c.situacao !== 'encerrada' && tipo === 'secretaria' && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Aguardando resposta" />
                    )}
                    <span className="truncate text-[12px] font-medium text-primary">
                      {c.tipo === 'grupo' ? `Motorista: ${c.motorista ?? '—'}` : (c.assunto ?? 'Sem motivo')}
                    </span>
                    {c.situacao === 'encerrada' && (
                      <span className="text-[10.5px] text-soft">· encerrada</span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-[11.5px] text-muted">{c.ultima_msg ?? '—'}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="card flex min-h-[420px] flex-col p-0">
            {!selecionada ? (
              <div className="py-16 text-center text-[12.5px] text-muted">
                Selecione uma conversa para ler.
              </div>
            ) : (
              <Fio conversa={selecionada} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Fio({ conversa }: { conversa: ConversaAtendimento }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [resposta, setResposta] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  const { data: msgs, isLoading } = useQuery({
    queryKey: ['conversa-mensagens', conversa.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mensagens_da_conversa', {
        p_conversa_id: conversa.id,
      })
      if (error) throw error
      return (data ?? []) as MensagemConversa[]
    },
  })

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs?.length])

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['conversas-atendimento'] })
    qc.invalidateQueries({ queryKey: ['conversa-mensagens', conversa.id] })
    qc.invalidateQueries({ queryKey: ['contadores-nav'] })
  }

  const responder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('enviar_mensagem_conversa', {
        p_conversa_id: conversa.id,
        p_corpo: resposta.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setResposta('')
      atualizar()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const encerrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('encerrar_conversa', { p_conversa_id: conversa.id })
      if (error) throw error
    },
    onSuccess: () => {
      atualizar()
      toast.sucesso('Conversa encerrada.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">
            {conversa.tipo === 'grupo' ? conversa.rota : conversa.assunto ?? 'Conversa'}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {conversa.tipo === 'grupo'
              ? `Motorista: ${conversa.motorista ?? '—'}`
              : `${conversa.estudante_nome ?? '—'} · prontuário ${conversa.prontuario ?? '—'}`}
            {conversa.tipo === 'direta' && conversa.destino === 'motorista' && (
              <> · com o motorista {conversa.motorista ?? '—'}</>
            )}{' '}
            · aberta em {dataHoraBR(conversa.criado_em)}
          </div>
        </div>
        {conversa.tipo === 'direta' && conversa.situacao !== 'encerrada' && (
          <button
            onClick={() => encerrar.mutate()}
            disabled={encerrar.isPending}
            className="btn-ghost px-3 py-1.5 text-[12px]"
          >
            Encerrar
          </button>
        )}
      </div>

      <div className="flex max-h-[520px] flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <CarregandoTabela linhas={3} />
        ) : (
          (msgs ?? []).map((m) => {
            const daSecretaria = m.autor_tipo === 'admin' || m.autor_tipo === 'operador'
            const doMotorista = m.autor_tipo === 'motorista'
            if (m.eh_bot) {
              return (
                <div key={m.id} className="self-center rounded-full bg-tint px-3 py-1 text-[11px] text-muted">
                  {m.corpo}
                </div>
              )
            }
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-btn px-3.5 py-2.5 ${
                  daSecretaria
                    ? 'self-end bg-primary text-primary-fg'
                    : doMotorista
                      ? 'self-start border-2 border-warn/50 bg-bg-warn'
                      : 'self-start bg-tint'
                }`}
              >
                <div
                  className={`mb-0.5 flex items-baseline justify-between gap-3 text-[11px] ${
                    daSecretaria ? 'text-primary-fg/80' : doMotorista ? 'font-semibold text-warn' : 'text-muted'
                  }`}
                >
                  <span className="font-medium">
                    {m.autor_nome ?? '—'}
                    {doMotorista && ' · motorista'}
                  </span>
                  <span className="font-mono text-[10px]">{dataHoraBR(m.criado_em)}</span>
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.corpo}</div>
              </div>
            )
          })
        )}
        <div ref={fimRef} />
      </div>

      <div className="border-t border-line px-5 py-4">
        <textarea
          rows={3}
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder={conversa.tipo === 'grupo' ? 'Mensagem para o grupo…' : 'Escreva a resposta…'}
          className="field resize-none"
        />
        <button
          onClick={() => responder.mutate()}
          disabled={!resposta.trim() || responder.isPending}
          className="btn-primary mt-2.5"
        >
          <IconeEnviar size={14} />
          {responder.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </>
  )
}

const ROTULO_DESTINO: Record<Destino, string> = {
  secretaria: 'Secretaria',
  motorista: 'Motorista',
}

/** Motivos que o estudante escolhe ao abrir uma conversa. */
function Motivos() {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ destino: 'secretaria' as Destino, titulo: '', descricao: '' })

  const { data, isLoading, error } = useQuery({
    queryKey: ['motivos-conversa'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('motivo_conversa')
        .select('id,destino,titulo,descricao,ordem,ativo')
        .order('destino')
        .order('ordem')
        .order('titulo')
      if (err) throw err
      return (data ?? []) as Motivo[]
    },
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['motivos-conversa'] })

  const criar = useMutation({
    mutationFn: async () => {
      const mesmos = (data ?? []).filter((m) => m.destino === form.destino)
      const { error: err } = await supabase.from('motivo_conversa').insert({
        destino: form.destino,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        ordem: mesmos.length ? Math.max(...mesmos.map((m) => m.ordem)) + 1 : 1,
      })
      if (err) throw err
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, titulo: '', descricao: '' }))
      invalidar()
      toast.sucesso('Motivo cadastrado.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const alternar = useMutation({
    mutationFn: async (m: Motivo) => {
      const { error: err } = await supabase
        .from('motivo_conversa')
        .update({ ativo: !m.ativo })
        .eq('id', m.id)
      if (err) throw err
    },
    onSuccess: invalidar,
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const excluir = useMutation({
    mutationFn: async (m: Motivo) => {
      const { error: err } = await supabase.from('motivo_conversa').delete().eq('id', m.id)
      if (err) throw err
    },
    onSuccess: () => {
      invalidar()
      toast.sucesso('Motivo removido. Conversas antigas mantêm o texto do motivo.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  if (error) return <ErroCarregamento mensagem={mensagemErro(error)} />
  if (isLoading) return <CarregandoTabela linhas={5} />

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {(['secretaria', 'motorista'] as Destino[]).map((destino) => {
          const itens = (data ?? []).filter((m) => m.destino === destino)
          return (
            <div key={destino} className="card overflow-hidden p-0">
              <div className="border-b border-line px-4 py-3 text-[13px] font-semibold">
                Conversas com {destino === 'secretaria' ? 'a secretaria' : 'o motorista'}
              </div>
              {itens.length === 0 ? (
                <div className="px-4 py-6 text-[12.5px] text-muted">
                  Nenhum motivo. Sem motivo cadastrado, o estudante não consegue abrir conversa.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {itens.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`min-w-0 flex-1 ${m.ativo ? '' : 'opacity-50'}`}>
                        <div className="text-[13px] font-medium">{m.titulo}</div>
                        {m.descricao && (
                          <div className="truncate text-[11.5px] text-muted">{m.descricao}</div>
                        )}
                      </div>
                      <button
                        onClick={() => alternar.mutate(m)}
                        className="btn-ghost px-2.5 py-1 text-[11.5px]"
                      >
                        {m.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => excluir.mutate(m)}
                        className="px-1.5 text-[11.5px] text-danger hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card h-fit p-4">
        <div className="mb-3 text-[13px] font-semibold">Novo motivo</div>
        <label className="mb-3 block">
          <span className="field-label">Contato</span>
          <select
            value={form.destino}
            onChange={(e) => setForm({ ...form, destino: e.target.value as Destino })}
            className="field"
          >
            {(['secretaria', 'motorista'] as Destino[]).map((d) => (
              <option key={d} value={d}>
                {ROTULO_DESTINO[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="field-label">Motivo</span>
          <input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ex.: Carteirinha"
            className="field"
          />
        </label>
        <label className="mb-3 block">
          <span className="field-label">Descrição (opcional)</span>
          <input
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Aparece abaixo do motivo no app"
            className="field"
          />
        </label>
        <button
          onClick={() => criar.mutate()}
          disabled={!form.titulo.trim() || criar.isPending}
          className="btn-primary w-full"
        >
          {criar.isPending ? 'Salvando…' : 'Cadastrar motivo'}
        </button>
      </div>
    </div>
  )
}
