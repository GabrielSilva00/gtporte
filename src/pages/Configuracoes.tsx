import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { mensagemErro, supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeInfo, IconeMais } from '../components/icons'
import { ROTULO_TIPO_PERFIL, type ConfiguracaoSistema, type MensagemModelo } from '../lib/types'

type Aba = 'geral' | 'conta' | 'modelos' | 'alertas'

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: 'geral', rotulo: 'Geral' },
  { chave: 'conta', rotulo: 'Minha conta' },
  { chave: 'modelos', rotulo: 'Mensagens prontas' },
  { chave: 'alertas', rotulo: 'Alertas' },
]

/** Campos globais editáveis, agrupados por aba. */
const CAMPOS_GERAIS: { chave: string; rotulo: string; ajuda: string }[] = [
  { chave: 'site_nome', rotulo: 'Nome do sistema', ajuda: 'Aparece no menu lateral e nas telas de acesso.' },
  { chave: 'site_subtitulo', rotulo: 'Subtítulo', ajuda: 'Linha de apoio logo abaixo do nome.' },
  { chave: 'contato_email', rotulo: 'E-mail de contato', ajuda: 'Divulgado aos estudantes e motoristas.' },
  { chave: 'contato_telefone', rotulo: 'Telefone de contato', ajuda: 'Divulgado aos estudantes e motoristas.' },
]

const CAMPOS_ALERTAS: { chave: string; rotulo: string; ajuda: string }[] = [
  {
    chave: 'alerta_docs_pendentes',
    rotulo: 'Documentos pendentes',
    ajuda: 'Mostra o alerta na Visão geral a partir desta quantidade.',
  },
  {
    chave: 'alerta_fila_espera',
    rotulo: 'Estudantes na fila de espera',
    ajuda: 'Mostra o alerta na Visão geral a partir desta quantidade.',
  },
  {
    chave: 'alerta_ocupacao_critica',
    rotulo: 'Ocupação crítica (%)',
    ajuda: 'Percentual de lotação que passa a ser tratado como crítico.',
  },
  {
    chave: 'rn05_antecedencia_horas',
    rotulo: 'Antecedência da volta (horas)',
    ajuda: 'RN05 — prazo mínimo para confirmar a volta sem ter confirmado a ida.',
  },
]

const MODELO_VAZIO = { titulo: '', assunto: '', corpo: '', evento: '' }

/** Configuração global do site, da conta e das mensagens automáticas. */
export default function Configuracoes() {
  const { perfil, ehAdmin, recarregar } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [aba, setAba] = useState<Aba>('geral')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [conta, setConta] = useState({ nome: '', telefone: '' })
  const [senha, setSenha] = useState({ nova: '', confirmacao: '' })

  const [modalModelo, setModalModelo] = useState(false)
  const [editandoModelo, setEditandoModelo] = useState<MensagemModelo | null>(null)
  const [formModelo, setFormModelo] = useState(MODELO_VAZIO)

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['configuracao-sistema'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('configuracao_sistema')
        .select('chave, valor, descricao')
      if (err) throw err
      return data as ConfiguracaoSistema[]
    },
  })

  const { data: modelos } = useQuery({
    queryKey: ['mensagem-modelos'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('mensagem_modelo')
        .select('*')
        .order('titulo')
      if (err) throw err
      return data as MensagemModelo[]
    },
  })

  useEffect(() => {
    if (config) setValores(Object.fromEntries(config.map((c) => [c.chave, c.valor])))
  }, [config])

  useEffect(() => {
    if (perfil) setConta({ nome: perfil.nome, telefone: perfil.telefone ?? '' })
  }, [perfil])

  const salvarConfig = useMutation({
    mutationFn: async (chaves: string[]) => {
      const linhas = chaves.map((chave) => ({ chave, valor: valores[chave] ?? '' }))
      const { error: err } = await supabase
        .from('configuracao_sistema')
        .upsert(linhas, { onConflict: 'chave' })
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracao-sistema'] })
      toast.sucesso('Configuração salva.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const salvarConta = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error('Sessão expirada.')
      const { error: err } = await supabase
        .from('perfil')
        .update({ nome: conta.nome.trim(), telefone: conta.telefone.trim() || null })
        .eq('id', perfil.id)
      if (err) throw err
    },
    onSuccess: async () => {
      await recarregar()
      toast.sucesso('Dados da conta atualizados.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const trocarSenha = useMutation({
    mutationFn: async () => {
      if (senha.nova.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
      if (senha.nova !== senha.confirmacao) throw new Error('As senhas não conferem.')
      const { error: err } = await supabase.auth.updateUser({ password: senha.nova })
      if (err) throw err
    },
    onSuccess: () => {
      setSenha({ nova: '', confirmacao: '' })
      toast.sucesso('Senha alterada.')
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const salvarModelo = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo: formModelo.titulo.trim(),
        assunto: formModelo.assunto.trim(),
        corpo: formModelo.corpo.trim(),
        evento: formModelo.evento.trim() || null,
        automatica: !!formModelo.evento.trim(),
      }
      const resposta = editandoModelo
        ? await supabase.from('mensagem_modelo').update(payload).eq('id', editandoModelo.id)
        : await supabase.from('mensagem_modelo').insert(payload)
      if (resposta.error) throw resposta.error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensagem-modelos'] })
      toast.sucesso(editandoModelo ? 'Modelo atualizado.' : 'Modelo criado.')
      fecharModelo()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  const excluirModelo = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('mensagem_modelo').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensagem-modelos'] })
      toast.sucesso('Modelo removido.')
      fecharModelo()
    },
    onError: (e) => toast.erro(mensagemErro(e)),
  })

  function abrirModelo(m?: MensagemModelo) {
    setEditandoModelo(m ?? null)
    setFormModelo(
      m
        ? { titulo: m.titulo, assunto: m.assunto, corpo: m.corpo, evento: m.evento ?? '' }
        : MODELO_VAZIO,
    )
    setModalModelo(true)
  }

  function fecharModelo() {
    setModalModelo(false)
    setEditandoModelo(null)
    setFormModelo(MODELO_VAZIO)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Configurações</h1>
        <div className="mt-1 text-[13px] text-muted">
          Campos globais do site, sua conta, mensagens prontas e limiares de alerta.
        </div>
      </div>

      <Tabs abas={ABAS} ativa={aba} onMudar={setAba} className="mb-4" />

      {error && <ErroCarregamento mensagem={mensagemErro(error)} />}
      {isLoading && <CarregandoCards itens={2} altura={180} />}

      {!ehAdmin && aba !== 'conta' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3 text-[12.5px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          Apenas administradores alteram a configuração global. Você está em modo leitura — a aba{' '}
          <b>Minha conta</b> continua editável.
        </div>
      )}

      {aba === 'geral' && (
        <BlocoCampos
          titulo="Identidade do site"
          campos={CAMPOS_GERAIS}
          valores={valores}
          somenteLeitura={!ehAdmin}
          salvando={salvarConfig.isPending}
          onChange={(chave, valor) => setValores((v) => ({ ...v, [chave]: valor }))}
          onSalvar={() => salvarConfig.mutate(CAMPOS_GERAIS.map((c) => c.chave))}
        />
      )}

      {aba === 'alertas' && (
        <BlocoCampos
          titulo="Limiares de alerta"
          campos={CAMPOS_ALERTAS}
          valores={valores}
          numerico
          somenteLeitura={!ehAdmin}
          salvando={salvarConfig.isPending}
          onChange={(chave, valor) => setValores((v) => ({ ...v, [chave]: valor }))}
          onSalvar={() => salvarConfig.mutate(CAMPOS_ALERTAS.map((c) => c.chave))}
        />
      )}

      {aba === 'conta' && (
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
          <div className="card p-5">
            <div className="text-[14.5px] font-semibold">Seus dados</div>
            <div className="mt-1 text-[12px] text-muted">
              {perfil?.login ?? perfil?.email} ·{' '}
              {perfil ? ROTULO_TIPO_PERFIL[perfil.tipo] : ''}
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label>
                <span className="field-label">Nome</span>
                <input
                  value={conta.nome}
                  onChange={(e) => setConta({ ...conta, nome: e.target.value })}
                  className="field"
                />
              </label>
              <label>
                <span className="field-label">Telefone</span>
                <input
                  value={conta.telefone}
                  onChange={(e) => setConta({ ...conta, telefone: e.target.value })}
                  placeholder="(18) 9 0000-0000"
                  className="field"
                />
              </label>
            </div>

            <button
              onClick={() => salvarConta.mutate()}
              disabled={conta.nome.trim().length < 3 || salvarConta.isPending}
              className="btn-primary mt-4"
            >
              {salvarConta.isPending ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>

          <div className="card p-5">
            <div className="text-[14.5px] font-semibold">Alterar senha</div>
            <div className="mt-1 text-[12px] text-muted">
              A troca vale imediatamente para o seu próximo acesso.
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label>
                <span className="field-label">Nova senha</span>
                <input
                  type="password"
                  value={senha.nova}
                  onChange={(e) => setSenha({ ...senha, nova: e.target.value })}
                  placeholder="mínimo 6 caracteres"
                  className="field"
                />
              </label>
              <label>
                <span className="field-label">Confirme a nova senha</span>
                <input
                  type="password"
                  value={senha.confirmacao}
                  onChange={(e) => setSenha({ ...senha, confirmacao: e.target.value })}
                  className="field"
                />
              </label>
            </div>

            <button
              onClick={() => trocarSenha.mutate()}
              disabled={!senha.nova || !senha.confirmacao || trocarSenha.isPending}
              className="btn-primary mt-4"
            >
              {trocarSenha.isPending ? 'Alterando…' : 'Alterar senha'}
            </button>
          </div>
        </div>
      )}

      {aba === 'modelos' && (
        <div>
          <div className="mb-3 flex items-end justify-between">
            <div className="text-[12.5px] text-muted">
              Textos prontos aplicados com um clique ao responder em Mensagens e Solicitações.
            </div>
            {ehAdmin && (
              <button onClick={() => abrirModelo()} className="btn-primary px-3 py-1.5 text-[12px]">
                <IconeMais size={13} />
                Novo modelo
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(modelos ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => ehAdmin && abrirModelo(m)}
                disabled={!ehAdmin}
                className="card p-4 text-left transition-colors enabled:hover:border-primary/30"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] font-semibold">{m.titulo}</span>
                  {m.automatica && (
                    <span className="shrink-0 font-mono text-3xs uppercase tracking-wide text-accent">
                      auto
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-muted">{m.assunto}</div>
                <div className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-soft">
                  {m.corpo}
                </div>
              </button>
            ))}
            {(modelos ?? []).length === 0 && (
              <div className="card px-6 py-12 text-center text-[12.5px] text-muted md:col-span-2">
                Nenhuma mensagem pronta cadastrada.
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        aberto={modalModelo}
        titulo={editandoModelo ? `Editar ${editandoModelo.titulo}` : 'Nova mensagem pronta'}
        largura={560}
        onFechar={fecharModelo}
        rodape={
          <>
            {editandoModelo && (
              <button
                onClick={() => excluirModelo.mutate(editandoModelo.id)}
                disabled={excluirModelo.isPending}
                className="btn-danger mr-auto"
              >
                Excluir
              </button>
            )}
            <button onClick={fecharModelo} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={() => salvarModelo.mutate()}
              disabled={
                !formModelo.titulo.trim() ||
                !formModelo.assunto.trim() ||
                !formModelo.corpo.trim() ||
                salvarModelo.isPending
              }
              className="btn-primary"
            >
              {salvarModelo.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label>
            <span className="field-label">Título</span>
            <input
              value={formModelo.titulo}
              onChange={(e) => setFormModelo({ ...formModelo, titulo: e.target.value })}
              placeholder="Documento aprovado"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Assunto</span>
            <input
              value={formModelo.assunto}
              onChange={(e) => setFormModelo({ ...formModelo, assunto: e.target.value })}
              placeholder="Documentação aprovada"
              className="field"
            />
          </label>
          <label>
            <span className="field-label">Corpo</span>
            <textarea
              rows={5}
              value={formModelo.corpo}
              onChange={(e) => setFormModelo({ ...formModelo, corpo: e.target.value })}
              className="field resize-none"
            />
          </label>
          <label>
            <span className="field-label">Evento (opcional)</span>
            <input
              value={formModelo.evento}
              onChange={(e) => setFormModelo({ ...formModelo, evento: e.target.value })}
              placeholder="documento_aprovado"
              className="field font-mono"
            />
            <span className="mt-1 block text-[11.5px] text-muted">
              Identifica o momento em que o texto deve ser sugerido. Preenchido, o modelo é
              marcado como automático.
            </span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

function BlocoCampos({
  titulo,
  campos,
  valores,
  numerico,
  somenteLeitura,
  salvando,
  onChange,
  onSalvar,
}: {
  titulo: string
  campos: { chave: string; rotulo: string; ajuda: string }[]
  valores: Record<string, string>
  numerico?: boolean
  somenteLeitura?: boolean
  salvando: boolean
  onChange: (chave: string, valor: string) => void
  onSalvar: () => void
}) {
  return (
    <div className="card max-w-3xl p-5">
      <div className="text-[14.5px] font-semibold">{titulo}</div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {campos.map(({ chave, rotulo, ajuda }) => (
          <label key={chave}>
            <span className="field-label">{rotulo}</span>
            <input
              type={numerico ? 'number' : 'text'}
              min={numerico ? 0 : undefined}
              value={valores[chave] ?? ''}
              disabled={somenteLeitura}
              onChange={(e) => onChange(chave, e.target.value)}
              className="field disabled:opacity-60"
            />
            <span className="mt-1 block text-[11.5px] text-muted">{ajuda}</span>
          </label>
        ))}
      </div>

      {!somenteLeitura && (
        <button onClick={onSalvar} disabled={salvando} className="btn-primary mt-4">
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
      )}
    </div>
  )
}
