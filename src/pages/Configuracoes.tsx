import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { mensagemErro, supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import { Tabs } from '../components/ui/Tabs'
import Organizacao from './configuracoes/Organizacao'
import Acessos from './configuracoes/Acessos'
import { CarregandoCards, ErroCarregamento } from '../components/ui/Estados'
import { useToast } from '../components/ui/Toast'
import { IconeBusca, IconeInfo, IconeMais } from '../components/icons'
import { ROTULO_TIPO_PERFIL, type ConfiguracaoSistema, type MensagemModelo } from '../lib/types'

type Aba = 'geral' | 'organizacao' | 'acessos' | 'conta' | 'modelos' | 'alertas'

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: 'geral', rotulo: 'Geral' },
  { chave: 'organizacao', rotulo: 'Organização' },
  { chave: 'acessos', rotulo: 'Acessos' },
  { chave: 'modelos', rotulo: 'Mensagens prontas' },
  { chave: 'alertas', rotulo: 'Alertas' },
  { chave: 'conta', rotulo: 'Minha conta' },
]

/** Campos globais editáveis, agrupados por aba. */
const CAMPOS_GERAIS: { chave: string; rotulo: string; ajuda: string }[] = [
  { chave: 'site_nome', rotulo: 'Nome do sistema', ajuda: 'Aparece no menu lateral e nas telas de acesso.' },
  { chave: 'site_subtitulo', rotulo: 'Subtítulo', ajuda: 'Linha de apoio logo abaixo do nome.' },
  { chave: 'contato_email', rotulo: 'E-mail de contato', ajuda: 'Divulgado aos estudantes e motoristas.' },
  { chave: 'contato_telefone', rotulo: 'Telefone de contato', ajuda: 'Divulgado aos estudantes e motoristas.' },
]

interface CampoConfig {
  chave: string
  rotulo: string
  ajuda: string
}

/** Limiares que disparam alerta na Visão geral. */
const CAMPOS_ALERTAS_OPERACAO: CampoConfig[] = [
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
    chave: 'alerta_documento_parado_dias',
    rotulo: 'Documento parado na fila (dias)',
    ajuda: 'Avisa quando um documento aguarda análise há mais dias que este limite.',
  },
  {
    chave: 'alerta_solicitacao_volta_horas',
    rotulo: 'Solicitação de volta sem decisão (horas)',
    ajuda: 'Avisa quando o motorista ainda não decidiu um pedido de volta avulsa.',
  },
]

/**
 * Antecedência com que o sistema avisa dos vencimentos. São documentos
 * cuja perda de validade impede a operação — CNH e toxicológico barram o
 * motorista, apólice e vistoria barram o veículo.
 */
const CAMPOS_ALERTAS_VENCIMENTO: CampoConfig[] = [
  {
    chave: 'alerta_cnh_dias',
    rotulo: 'CNH a vencer (dias)',
    ajuda: 'Antecedência do aviso de renovação da habilitação.',
  },
  {
    chave: 'alerta_toxicologico_dias',
    rotulo: 'Exame toxicológico a vencer (dias)',
    ajuda: 'Obrigatório para as categorias C, D e E.',
  },
  {
    chave: 'alerta_aso_dias',
    rotulo: 'ASO a vencer (dias)',
    ajuda: 'Atestado de saúde ocupacional do motorista.',
  },
  {
    chave: 'alerta_apolice_dias',
    rotulo: 'Apólice de seguro a vencer (dias)',
    ajuda: 'Veículo sem seguro válido não pode circular (CTB).',
  },
  {
    chave: 'alerta_vistoria_dias',
    rotulo: 'Vistoria semestral a vencer (dias)',
    ajuda: 'Vistoria dos veículos é obrigatória no transporte escolar.',
  },
  {
    chave: 'alerta_contrato_dias',
    rotulo: 'Contrato a vencer (dias)',
    ajuda: 'Antecedência do aviso de encerramento da vigência contratual.',
  },
]

/** Regras de negócio parametrizáveis, não são alertas. */
const CAMPOS_REGRAS: CampoConfig[] = [
  {
    chave: 'rn05_antecedencia_horas',
    rotulo: 'Antecedência da volta (horas)',
    ajuda: 'RN05 — prazo mínimo para confirmar a volta sem ter confirmado a ida.',
  },
  {
    chave: 'rn03_tolerancia_lotacao',
    rotulo: 'Tolerância de lotação (assentos)',
    ajuda: 'RN03 — quantos assentos acima da capacidade a distribuição aceita. Zero é o padrão.',
  },
]


const MODELO_VAZIO = { titulo: '', assunto: '', corpo: '', evento: '' }

/**
 * Momentos em que o sistema sugere um texto pronto. Ficam listados aqui
 * para o administrador escolher em vez de digitar a chave à mão e errar.
 */
const EVENTOS_MODELO: { valor: string; rotulo: string }[] = [
  { valor: '', rotulo: 'Nenhum — texto apenas manual' },
  { valor: 'documento_aprovado', rotulo: 'Documento aprovado' },
  { valor: 'documento_pendente', rotulo: 'Documento pendente ou rejeitado' },
  { valor: 'alocacao_definida', rotulo: 'Estudante alocado em rota' },
  { valor: 'fila_espera', rotulo: 'Estudante entrou na fila de espera' },
  { valor: 'rota_alterada', rotulo: 'Rota alterada' },
  { valor: 'volta_aprovada', rotulo: 'Solicitação de volta aprovada' },
  { valor: 'volta_recusada', rotulo: 'Solicitação de volta recusada' },
  { valor: 'cnh_vencendo', rotulo: 'CNH do motorista a vencer' },
  { valor: 'toxicologico_vencendo', rotulo: 'Exame toxicológico a vencer' },
  { valor: 'presenca_nao_confirmada', rotulo: 'Presença não confirmada no prazo' },
  { valor: 'cadastro_incompleto', rotulo: 'Cadastro do estudante incompleto' },
]

/** Marcadores substituídos no envio. */
const VARIAVEIS_MODELO: { chave: string; descricao: string }[] = [
  { chave: '{{nome}}', descricao: 'nome do destinatário' },
  { chave: '{{prontuario}}', descricao: 'prontuário do estudante' },
  { chave: '{{rota}}', descricao: 'código da rota' },
  { chave: '{{data}}', descricao: 'data do evento' },
  { chave: '{{horario}}', descricao: 'horário de partida ou retorno' },
  { chave: '{{motorista}}', descricao: 'nome do motorista' },
]

/** Exemplo usado só na pré-visualização do modal. */
const EXEMPLO_VARIAVEIS: Record<string, string> = {
  '{{nome}}': 'Marina Rocha',
  '{{prontuario}}': '218926',
  '{{rota}}': 'R03',
  '{{data}}': '24/08/2026',
  '{{horario}}': '18:10',
  '{{motorista}}': 'Joel Barbosa',
}

function aplicarExemplo(texto: string): string {
  return Object.entries(EXEMPLO_VARIAVEIS).reduce(
    (acc, [chave, valor]) => acc.split(chave).join(valor),
    texto,
  )
}

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
  const [buscaModelo, setBuscaModelo] = useState('')
  const [filtroModelo, setFiltroModelo] = useState<'todos' | 'automatica' | 'manual'>('todos')

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

  /**
   * Duplicar abre o modal em modo criação com o conteúdo copiado — evita
   * redigitar um texto quase igual só para mudar o evento de disparo.
   */
  function duplicarModelo(m: MensagemModelo) {
    setEditandoModelo(null)
    setFormModelo({
      titulo: `${m.titulo} (cópia)`,
      assunto: m.assunto,
      corpo: m.corpo,
      evento: '',
    })
    setModalModelo(true)
  }

  const modelosFiltrados = (modelos ?? []).filter((m) => {
    if (filtroModelo === 'automatica' && !m.automatica) return false
    if (filtroModelo === 'manual' && m.automatica) return false
    const termo = buscaModelo.trim().toLowerCase()
    if (!termo) return true
    return `${m.titulo} ${m.assunto} ${m.corpo} ${m.evento ?? ''}`.toLowerCase().includes(termo)
  })

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
        <div className="flex flex-col gap-3.5">
          <BlocoCampos
            titulo="Alertas de operação"
            descricao="Aparecem no cartão de alertas da Visão geral quando o limite é atingido."
            campos={CAMPOS_ALERTAS_OPERACAO}
            valores={valores}
            numerico
            somenteLeitura={!ehAdmin}
            salvando={salvarConfig.isPending}
            onChange={(chave, valor) => setValores((v) => ({ ...v, [chave]: valor }))}
            onSalvar={() => salvarConfig.mutate(CAMPOS_ALERTAS_OPERACAO.map((c) => c.chave))}
          />
          <BlocoCampos
            titulo="Avisos de vencimento"
            descricao="Com quantos dias de antecedência avisar. Documento vencido impede a operação."
            campos={CAMPOS_ALERTAS_VENCIMENTO}
            valores={valores}
            numerico
            somenteLeitura={!ehAdmin}
            salvando={salvarConfig.isPending}
            onChange={(chave, valor) => setValores((v) => ({ ...v, [chave]: valor }))}
            onSalvar={() => salvarConfig.mutate(CAMPOS_ALERTAS_VENCIMENTO.map((c) => c.chave))}
          />
          <BlocoCampos
            titulo="Regras de negócio"
            descricao="Parâmetros aplicados pelo próprio banco nas funções de presença e distribuição."
            campos={CAMPOS_REGRAS}
            valores={valores}
            numerico
            somenteLeitura={!ehAdmin}
            salvando={salvarConfig.isPending}
            onChange={(chave, valor) => setValores((v) => ({ ...v, [chave]: valor }))}
            onSalvar={() => salvarConfig.mutate(CAMPOS_REGRAS.map((c) => c.chave))}
          />
        </div>
      )}

      {aba === 'organizacao' && <Organizacao somenteLeitura={!ehAdmin} />}

      {aba === 'acessos' && <Acessos />}

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
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-[52ch] text-[12.5px] text-muted">
              Textos prontos aplicados com um clique ao responder em Mensagens e Solicitações. Os
              marcados como <b>automáticos</b> ficam vinculados a um evento do sistema.
            </div>
            {ehAdmin && (
              <button onClick={() => abrirModelo()} className="btn-primary px-3 py-1.5 text-[12px]">
                <IconeMais size={13} />
                Novo modelo
              </button>
            )}
          </div>

          <div className="card mb-3.5 flex flex-wrap items-center gap-3 p-3.5">
            <div className="relative min-w-[220px] flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft">
                <IconeBusca size={15} />
              </span>
              <input
                className="field pl-9"
                placeholder="Título, assunto ou trecho do texto"
                value={buscaModelo}
                onChange={(e) => setBuscaModelo(e.target.value)}
              />
            </div>
            <Tabs
              variante="pilulas"
              abas={[
                { chave: 'todos', rotulo: 'Todos', contador: modelos?.length ?? 0 },
                {
                  chave: 'automatica',
                  rotulo: 'Automáticos',
                  contador: (modelos ?? []).filter((m) => m.automatica).length,
                },
                {
                  chave: 'manual',
                  rotulo: 'Manuais',
                  contador: (modelos ?? []).filter((m) => !m.automatica).length,
                },
              ]}
              ativa={filtroModelo}
              onMudar={setFiltroModelo}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {modelosFiltrados.map((m) => {
              const evento = EVENTOS_MODELO.find((e) => e.valor === (m.evento ?? ''))
              return (
                <div key={m.id} className="card flex flex-col p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-semibold">{m.titulo}</span>
                    {m.automatica && (
                      <span className="shrink-0 font-mono text-3xs uppercase tracking-wide text-accent">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{m.assunto}</div>
                  <div className="mt-2 line-clamp-3 flex-1 text-[12px] leading-relaxed text-soft">
                    {m.corpo}
                  </div>

                  {m.automatica && evento && (
                    <div className="mt-2.5 text-[11px] text-muted">
                      Disparo: <b>{evento.rotulo}</b>
                    </div>
                  )}

                  {ehAdmin && (
                    <div className="mt-3 flex gap-2 border-t border-line pt-2.5">
                      <button
                        onClick={() => abrirModelo(m)}
                        className="text-[11.5px] font-medium text-primary hover:underline"
                      >
                        editar
                      </button>
                      <button
                        onClick={() => duplicarModelo(m)}
                        className="text-[11.5px] font-medium text-muted hover:underline"
                      >
                        duplicar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {modelosFiltrados.length === 0 && (
              <div className="card px-6 py-12 text-center text-[12.5px] text-muted md:col-span-2">
                {(modelos ?? []).length === 0
                  ? 'Nenhuma mensagem pronta cadastrada.'
                  : 'Nenhum modelo corresponde ao filtro.'}
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
          <div>
            <span className="field-label">Corpo</span>
            <textarea
              rows={5}
              value={formModelo.corpo}
              onChange={(e) => setFormModelo({ ...formModelo, corpo: e.target.value })}
              className="field resize-y"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">Inserir:</span>
              {VARIAVEIS_MODELO.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  title={v.descricao}
                  onClick={() =>
                    setFormModelo((atual) => ({ ...atual, corpo: `${atual.corpo}${v.chave}` }))
                  }
                  className="rounded-full border border-edge px-2 py-0.5 font-mono text-[10.5px] text-muted hover:border-primary/40 hover:text-ink"
                >
                  {v.chave}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="field-label">Evento de disparo</span>
            <select
              value={formModelo.evento}
              onChange={(e) => setFormModelo({ ...formModelo, evento: e.target.value })}
              className="field"
            >
              {EVENTOS_MODELO.map((ev) => (
                <option key={ev.valor} value={ev.valor}>
                  {ev.rotulo}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] text-muted">
              Com um evento escolhido, o modelo passa a ser sugerido automaticamente naquele
              momento. Sem evento, fica disponível apenas como texto pronto na resposta.
            </span>
          </label>

          <div className="rounded-field border border-edge bg-panel p-3">
            <div className="field-label">Pré-visualização</div>
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
              {formModelo.corpo.trim()
                ? aplicarExemplo(formModelo.corpo)
                : 'Digite o corpo da mensagem para ver como ela chega ao destinatário.'}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function BlocoCampos({
  titulo,
  descricao,
  campos,
  valores,
  numerico,
  somenteLeitura,
  salvando,
  onChange,
  onSalvar,
}: {
  titulo: string
  descricao?: string
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
      {descricao && <p className="mt-1 text-[12px] text-muted">{descricao}</p>}

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
