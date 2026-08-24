import { useState } from 'react'
import { useMotoristas, useOcupacaoRotas, useUniversidades, useVeiculos } from '../hooks/useCadastros'
import { mensagemErro, supabase } from '../lib/supabase'
import { badgeVeiculo, dataBR, diasParaVencer, DIAS_SEMANA, hora } from '../lib/format'
import {
  ROTULO_PERFIL_USO,
  ROTULO_SITUACAO_MOTORISTA,
  ROTULO_VINCULO,
  type Estudante,
  type Motorista,
  type Universidade,
  type Veiculo,
} from '../lib/types'

/** A tabela usa "Aprovado/Pendente/Rejeitado"; o relatório repete o rótulo. */
const ROTULO_STATUS_DOCUMENTAL: Record<string, string> = {
  aprovado: 'Aprovado',
  pendente: 'Pendente',
  rejeitado: 'Rejeitado',
}
import { exportarExcel, exportarPDF, type Coluna } from '../lib/exportar'
import { useToast } from '../components/ui/Toast'
import { Modal } from '../components/ui/Modal'
import {
  IconeDashboard,
  IconeDocumento,
  IconeEquipe,
  IconeEstudante,
  IconeMotorista,
  IconePresenca,
  IconeRota,
  IconeUniversidade,
  IconeVeiculo,
} from '../components/icons'

type ChaveRelatorio =
  | 'frequencia'
  | 'ocupacao'
  | 'alunos_rota'
  | 'historico'
  | 'feedbacks'
  | 'log'
  | 'cad_estudantes'
  | 'cad_universidades'
  | 'cad_veiculos'
  | 'cad_motoristas'

/** Cada relatório declara os filtros que realmente usa. */
type ChaveFiltro =
  | 'periodo'
  | 'rota'
  | 'veiculo'
  | 'motorista'
  | 'universidade'
  | 'grade'
  | 'situacaoMotorista'
  | 'statusVeiculo'
  | 'statusDocumental'
  | 'perfilUso'

type Categoria = 'Operação' | 'Cadastros' | 'Auditoria'

interface Filtros {
  inicio: string
  fim: string
  rotaId: string
  veiculoId: string
  motoristaId: string
  universidadeId: string
  diaSemana: string
  horaInicio: string
  horaFim: string
  situacaoMotorista: string
  statusVeiculo: string
  statusDocumental: string
  perfilUso: string
}

const FILTROS_VAZIOS: Filtros = {
  inicio: '',
  fim: '',
  rotaId: '',
  veiculoId: '',
  motoristaId: '',
  universidadeId: '',
  diaSemana: '',
  horaInicio: '',
  horaFim: '',
  situacaoMotorista: '',
  statusVeiculo: '',
  statusDocumental: '',
  perfilUso: '',
}

const RELATORIOS: {
  chave: ChaveRelatorio
  titulo: string
  descricao: string
  categoria: Categoria
  filtros: ChaveFiltro[]
  Icone: typeof IconePresenca
  iconBg: string
  iconFg: string
  requisito: string
}[] = [
  {
    chave: 'frequencia',
    titulo: 'Frequência por estudante',
    descricao: 'Embarques confirmados por aluno e período.',
    categoria: 'Operação',
    filtros: ['periodo', 'rota', 'universidade'],
    Icone: IconePresenca,
    iconBg: '#EAF3EC',
    iconFg: '#2E7D5A',
    requisito: 'RF18',
  },
  {
    chave: 'ocupacao',
    titulo: 'Ocupação por veículo',
    descricao: 'Assentos ocupados por rota e capacidade da frota.',
    categoria: 'Operação',
    filtros: ['rota', 'veiculo', 'motorista'],
    Icone: IconeVeiculo,
    iconBg: '#FBEEDA',
    iconFg: '#8A5A15',
    requisito: 'RF19',
  },
  {
    chave: 'alunos_rota',
    titulo: 'Alunos por rota',
    descricao: 'Distribuição atual por rota e universidade.',
    categoria: 'Operação',
    filtros: ['rota', 'universidade'],
    Icone: IconeRota,
    iconBg: '#EEF1EF',
    iconFg: '#1F3A2E',
    requisito: 'RF17',
  },
  {
    chave: 'historico',
    titulo: 'Histórico de utilização',
    descricao: 'Cronologia individual de alocações por estudante.',
    categoria: 'Auditoria',
    filtros: ['periodo', 'rota'],
    Icone: IconeDashboard,
    iconBg: '#F4EAE1',
    iconFg: '#C4633A',
    requisito: 'RF24',
  },
  {
    chave: 'feedbacks',
    titulo: 'Feedbacks recebidos',
    descricao: 'Avaliações registradas pelos estudantes.',
    categoria: 'Auditoria',
    filtros: ['periodo'],
    Icone: IconeDocumento,
    iconBg: '#EEF1EF',
    iconFg: '#6B7570',
    requisito: 'RF23',
  },
  {
    chave: 'log',
    titulo: 'Log administrativo',
    descricao: 'Alterações cadastrais e ajustes manuais de alocação.',
    categoria: 'Auditoria',
    filtros: ['periodo'],
    Icone: IconeEquipe,
    iconBg: '#EEF1EF',
    iconFg: '#1F3A2E',
    requisito: 'RN12',
  },
  {
    chave: 'cad_estudantes',
    titulo: 'Cadastro de estudantes',
    descricao:
      'Lista completa com curso, perfil de uso e situação documental. Permite recortar por horário de aula.',
    categoria: 'Cadastros',
    filtros: ['universidade', 'statusDocumental', 'perfilUso', 'grade'],
    Icone: IconeEstudante,
    iconBg: '#EAF3EC',
    iconFg: '#2E7D5A',
    requisito: 'RF01',
  },
  {
    chave: 'cad_universidades',
    titulo: 'Cadastro de universidades',
    descricao: 'Instituições atendidas, endereço do campus e estudantes vinculados.',
    categoria: 'Cadastros',
    filtros: [],
    Icone: IconeUniversidade,
    iconBg: '#EEF1EF',
    iconFg: '#1F3A2E',
    requisito: 'RF06',
  },
  {
    chave: 'cad_veiculos',
    titulo: 'Cadastro de veículos',
    descricao: 'Frota com capacidade, ano e situação operacional.',
    categoria: 'Cadastros',
    filtros: ['statusVeiculo'],
    Icone: IconeVeiculo,
    iconBg: '#FBEEDA',
    iconFg: '#8A5A15',
    requisito: 'RF05',
  },
  {
    chave: 'cad_motoristas',
    titulo: 'Cadastro de motoristas',
    descricao:
      'Equipe com CNH, exame toxicológico e vínculo. Destaca o que está vencido ou a vencer.',
    categoria: 'Cadastros',
    filtros: ['situacaoMotorista', 'statusDocumental'],
    Icone: IconeMotorista,
    iconBg: '#F4EAE1',
    iconFg: '#C4633A',
    requisito: 'RF04',
  },
]

const CATEGORIAS: Categoria[] = ['Operação', 'Cadastros', 'Auditoria']

const ROTULO_FILTRO: Record<ChaveFiltro, string> = {
  periodo: 'período',
  rota: 'rota',
  veiculo: 'veículo',
  motorista: 'motorista',
  universidade: 'universidade',
  grade: 'horário de aula',
  situacaoMotorista: 'situação',
  statusVeiculo: 'situação',
  statusDocumental: 'documentação',
  perfilUso: 'perfil de uso',
}

const COLUNAS: Record<ChaveRelatorio, Coluna[]> = {
  frequencia: [
    { chave: 'nome', titulo: 'Estudante' },
    { chave: 'prontuario', titulo: 'Prontuário' },
    { chave: 'universidade', titulo: 'Universidade' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'data', titulo: 'Data' },
    { chave: 'presencas_ida', titulo: 'Ida' },
    { chave: 'presencas_volta', titulo: 'Volta' },
  ],
  ocupacao: [
    { chave: 'codigo', titulo: 'Rota' },
    { chave: 'nome', titulo: 'Descrição' },
    { chave: 'placa', titulo: 'Placa' },
    { chave: 'modelo', titulo: 'Modelo' },
    { chave: 'motorista', titulo: 'Motorista' },
    { chave: 'ocupacao', titulo: 'Ocupados' },
    { chave: 'capacidade_maxima', titulo: 'Capacidade' },
    { chave: 'percentual', titulo: '%' },
  ],
  alunos_rota: [
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'rota_nome', titulo: 'Descrição' },
    { chave: 'universidade', titulo: 'Universidade' },
    { chave: 'alunos', titulo: 'Alunos' },
  ],
  historico: [
    { chave: 'nome', titulo: 'Estudante' },
    { chave: 'prontuario', titulo: 'Prontuário' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'situacao', titulo: 'Situação' },
    { chave: 'origem', titulo: 'Origem' },
    { chave: 'criado_em', titulo: 'Início' },
    { chave: 'encerrado_em', titulo: 'Fim' },
  ],
  feedbacks: [
    { chave: 'estudante', titulo: 'Estudante' },
    { chave: 'rota', titulo: 'Rota' },
    { chave: 'nota', titulo: 'Nota' },
    { chave: 'comentario', titulo: 'Comentário' },
    { chave: 'criado_em', titulo: 'Data' },
  ],
  log: [
    { chave: 'criado_em', titulo: 'Data' },
    { chave: 'acao', titulo: 'Ação' },
    { chave: 'entidade', titulo: 'Entidade' },
    { chave: 'responsavel', titulo: 'Responsável' },
  ],
  cad_estudantes: [
    { chave: 'prontuario', titulo: 'Prontuário' },
    { chave: 'nome', titulo: 'Estudante' },
    { chave: 'universidade', titulo: 'Universidade' },
    { chave: 'curso', titulo: 'Curso' },
    { chave: 'cidade', titulo: 'Cidade' },
    { chave: 'perfil_uso', titulo: 'Perfil de uso' },
    { chave: 'documentacao', titulo: 'Documentação' },
    { chave: 'aulas', titulo: 'Grade horária' },
    { chave: 'telefone', titulo: 'Telefone' },
  ],
  cad_universidades: [
    { chave: 'nome', titulo: 'Instituição' },
    { chave: 'cidade', titulo: 'Cidade' },
    { chave: 'endereco', titulo: 'Endereço' },
    { chave: 'cep', titulo: 'CEP' },
    { chave: 'estudantes', titulo: 'Estudantes' },
  ],
  cad_veiculos: [
    { chave: 'placa', titulo: 'Placa' },
    { chave: 'modelo', titulo: 'Modelo' },
    { chave: 'ano', titulo: 'Ano' },
    { chave: 'capacidade_maxima', titulo: 'Capacidade' },
    { chave: 'situacao', titulo: 'Situação' },
    { chave: 'observacao', titulo: 'Observação' },
  ],
  cad_motoristas: [
    { chave: 'nome', titulo: 'Motorista' },
    { chave: 'cpf', titulo: 'CPF' },
    { chave: 'cnh', titulo: 'CNH' },
    { chave: 'categoria_cnh', titulo: 'Cat.' },
    { chave: 'validade_cnh', titulo: 'Validade CNH' },
    { chave: 'toxicologico', titulo: 'Toxicológico até' },
    { chave: 'situacao', titulo: 'Situação' },
    { chave: 'vinculo', titulo: 'Vínculo' },
    { chave: 'documentacao', titulo: 'Documentação' },
    { chave: 'telefone', titulo: 'Telefone' },
  ],
}

/** Descreve a grade em uma célula só, para caber na exportação. */
function descreverGrade(
  linhas: { dia_semana: number; hora_inicio: string; hora_fim: string }[],
): string {
  if (!linhas || linhas.length === 0) return '-'
  return [...linhas]
    .sort((a, b) => a.dia_semana - b.dia_semana)
    .map((l) => {
      const dia = DIAS_SEMANA.find((d) => d.numero === l.dia_semana)
      return `${dia?.curto ?? l.dia_semana} ${hora(l.hora_inicio)}–${hora(l.hora_fim)}`
    })
    .join('; ')
}

/**
 * Data de validade com marca de vencimento. Em PDF e Excel não há cor,
 * então a informação precisa estar no próprio texto.
 */
function comAlerta(data: string | null): string {
  if (!data) return '-'
  const dias = diasParaVencer(data)
  if (dias === null) return dataBR(data)
  if (dias < 0) return `${dataBR(data)} (vencido)`
  if (dias <= 60) return `${dataBR(data)} (vence em ${dias}d)`
  return dataBR(data)
}

/** RF17, RF18, RF19 — relatórios gerenciais com filtros e exportação. */
export default function Relatorios() {
  const { data: rotas } = useOcupacaoRotas()
  const { data: veiculos } = useVeiculos()
  const { data: motoristas } = useMotoristas()
  const { data: universidades } = useUniversidades()
  const toast = useToast()

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [previa, setPrevia] = useState<{
    chave: ChaveRelatorio
    titulo: string
    linhas: Record<string, unknown>[]
  } | null>(null)
  const [gerando, setGerando] = useState<ChaveRelatorio | null>(null)
  /** Relatório cujo painel de filtros está aberto. */
  const [configurando, setConfigurando] = useState<ChaveRelatorio | null>(null)

  const meta = RELATORIOS.find((r) => r.chave === configurando) ?? null

  const subtitulo = montarSubtitulo(filtros, rotas, veiculos, motoristas, universidades)

  async function carregar(chave: ChaveRelatorio): Promise<Record<string, unknown>[]> {
    switch (chave) {
      case 'frequencia': {
        let q = supabase.from('vw_frequencia_estudante').select('*').not('data', 'is', null)
        if (filtros.inicio) q = q.gte('data', filtros.inicio)
        if (filtros.fim) q = q.lte('data', filtros.fim)
        if (filtros.universidadeId) {
          const uni = universidades?.find((u) => u.id === filtros.universidadeId)
          if (uni) q = q.eq('universidade', uni.nome)
        }
        if (filtros.rotaId) {
          const rota = rotas?.find((r) => r.rota_id === filtros.rotaId)
          if (rota) q = q.eq('rota', rota.codigo)
        }
        const { data, error } = await q.order('nome')
        if (error) throw error
        return data.map((l) => ({ ...l, data: dataBR(l.data as string) }))
      }

      case 'ocupacao': {
        let q = supabase.from('vw_ocupacao_rota').select('*')
        if (filtros.rotaId) q = q.eq('rota_id', filtros.rotaId)
        if (filtros.veiculoId) {
          const v = veiculos?.find((x) => x.id === filtros.veiculoId)
          if (v) q = q.eq('placa', v.placa)
        }
        if (filtros.motoristaId) {
          const m = motoristas?.find((x) => x.id === filtros.motoristaId)
          if (m) q = q.eq('motorista', m.nome)
        }
        const { data, error } = await q.order('codigo')
        if (error) throw error
        return data.map((l) => ({
          ...l,
          percentual: `${l.percentual ?? 0}%`,
          horario: `${hora(l.horario_partida as string)} → ${hora(l.horario_retorno as string)}`,
        }))
      }

      case 'alunos_rota': {
        let q = supabase.from('vw_alunos_por_rota').select('*')
        if (filtros.universidadeId) {
          const uni = universidades?.find((u) => u.id === filtros.universidadeId)
          if (uni) q = q.eq('universidade', uni.nome)
        }
        const { data, error } = await q.order('rota')
        if (error) throw error
        return data
      }

      case 'historico': {
        let q = supabase.from('vw_historico_utilizacao').select('*')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false }).limit(2000)
        if (error) throw error
        return data.map((l) => ({
          ...l,
          criado_em: dataBR(l.criado_em as string),
          encerrado_em: l.encerrado_em ? dataBR(l.encerrado_em as string) : 'em vigor',
        }))
      }

      case 'feedbacks': {
        let q = supabase
          .from('feedback')
          .select('nota, comentario, criado_em, estudante:estudante_id (nome), rota:rota_id (codigo)')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false })
        if (error) throw error
        return (data as unknown as {
          nota: number
          comentario: string | null
          criado_em: string
          estudante: { nome: string } | null
          rota: { codigo: string } | null
        }[]).map((f) => ({
          estudante: f.estudante?.nome ?? '-',
          rota: f.rota?.codigo ?? '-',
          nota: f.nota,
          comentario: f.comentario ?? '-',
          criado_em: dataBR(f.criado_em),
        }))
      }

      case 'log': {
        let q = supabase
          .from('log_administrativo')
          .select('acao, entidade, criado_em, perfil:perfil_id (nome)')
        if (filtros.inicio) q = q.gte('criado_em', filtros.inicio)
        if (filtros.fim) q = q.lte('criado_em', `${filtros.fim}T23:59:59`)
        const { data, error } = await q.order('criado_em', { ascending: false }).limit(1000)
        if (error) throw error
        return (data as unknown as {
          acao: string
          entidade: string
          criado_em: string
          perfil: { nome: string } | null
        }[]).map((l) => ({
          criado_em: new Date(l.criado_em).toLocaleString('pt-BR'),
          acao: l.acao,
          entidade: l.entidade,
          responsavel: l.perfil?.nome ?? 'sistema',
        }))
      }

      case 'cad_estudantes': {
        // O recorte por horário de aula vem da grade_horaria. Com o filtro
        // ativo o embed vira !inner, o que já elimina quem não tem aula na
        // janela pedida sem precisar trazer todo mundo e filtrar aqui.
        const temGrade = !!(filtros.diaSemana || filtros.horaInicio || filtros.horaFim)
        const embed = temGrade ? 'grade_horaria!inner' : 'grade_horaria'

        let q = supabase
          .from('estudante')
          .select(
            `*, universidade:universidade_id (nome), cidade:cidade_id (nome), ${embed} (dia_semana, hora_inicio, hora_fim)`,
          )
          .eq('ativo', true)

        if (filtros.universidadeId) q = q.eq('universidade_id', filtros.universidadeId)
        if (filtros.statusDocumental) q = q.eq('status_documental', filtros.statusDocumental)
        if (filtros.perfilUso) q = q.eq('perfil_uso', filtros.perfilUso)

        if (filtros.diaSemana) q = q.eq('grade_horaria.dia_semana', Number(filtros.diaSemana))
        // "Sai da aula neste intervalo": o término da aula cai na janela.
        if (filtros.horaInicio) q = q.gte('grade_horaria.hora_fim', filtros.horaInicio)
        if (filtros.horaFim) q = q.lte('grade_horaria.hora_fim', filtros.horaFim)

        const { data, error } = await q.order('nome')
        if (error) throw error

        return (data as unknown as (Estudante & {
          universidade: { nome: string } | null
          cidade: { nome: string } | null
          grade_horaria: { dia_semana: number; hora_inicio: string; hora_fim: string }[]
        })[]).map((e) => ({
          prontuario: e.prontuario,
          nome: e.nome,
          universidade: e.universidade?.nome ?? '-',
          curso: e.curso ?? '-',
          cidade: e.cidade?.nome ?? '-',
          perfil_uso: ROTULO_PERFIL_USO[e.perfil_uso],
          documentacao: ROTULO_STATUS_DOCUMENTAL[e.status_documental],
          aulas: descreverGrade(e.grade_horaria),
          telefone: e.telefone ?? '-',
        }))
      }

      case 'cad_universidades': {
        const [uni, alunos] = await Promise.all([
          supabase.from('universidade').select('*, cidade:cidade_id (nome, uf)').order('nome'),
          supabase.from('estudante').select('universidade_id').eq('ativo', true),
        ])
        if (uni.error) throw uni.error
        if (alunos.error) throw alunos.error

        const porUni = new Map<string, number>()
        for (const a of alunos.data as { universidade_id: string }[]) {
          porUni.set(a.universidade_id, (porUni.get(a.universidade_id) ?? 0) + 1)
        }

        return (uni.data as unknown as (Universidade & {
          cidade: { nome: string; uf: string } | null
        })[]).map((u) => ({
          nome: u.nome,
          cidade: u.cidade ? `${u.cidade.nome}/${u.cidade.uf}` : '-',
          endereco: [u.logradouro, u.numero, u.bairro].filter(Boolean).join(', ') || '-',
          cep: u.cep ?? '-',
          estudantes: porUni.get(u.id) ?? 0,
        }))
      }

      case 'cad_veiculos': {
        let q = supabase.from('veiculo').select('*')
        if (filtros.statusVeiculo) q = q.eq('status', filtros.statusVeiculo)
        const { data, error } = await q.order('placa')
        if (error) throw error

        return (data as Veiculo[]).map((v) => ({
          placa: v.placa,
          modelo: v.modelo,
          ano: v.ano ?? '-',
          capacidade_maxima: v.capacidade_maxima,
          situacao: badgeVeiculo(v.status).rotulo,
          observacao: v.observacao ?? '-',
        }))
      }

      case 'cad_motoristas': {
        let q = supabase.from('motorista').select('*')
        if (filtros.situacaoMotorista) q = q.eq('situacao', filtros.situacaoMotorista)
        if (filtros.statusDocumental) q = q.eq('status_documental', filtros.statusDocumental)
        const { data, error } = await q.order('nome')
        if (error) throw error

        return (data as Motorista[]).map((m) => ({
          nome: m.nome,
          cpf: m.cpf ?? '-',
          cnh: m.cnh,
          categoria_cnh: m.categoria_cnh,
          validade_cnh: comAlerta(m.validade_cnh),
          toxicologico: comAlerta(m.toxicologico_validade),
          situacao: ROTULO_SITUACAO_MOTORISTA[m.situacao ?? 'ativo'],
          vinculo: m.vinculo ? ROTULO_VINCULO[m.vinculo] : '-',
          documentacao: ROTULO_STATUS_DOCUMENTAL[m.status_documental ?? 'pendente'],
          telefone: m.telefone ?? '-',
        }))
      }
    }
  }

  async function gerar(chave: ChaveRelatorio, formato: 'previa' | 'pdf' | 'excel') {
    setGerando(chave)
    try {
      const linhas = await carregar(chave)
      if (linhas.length === 0) {
        toast.alerta('Nenhum dado encontrado para os filtros selecionados.')
        return
      }
      const info = RELATORIOS.find((r) => r.chave === chave)!
      if (formato === 'pdf') exportarPDF(info.titulo, subtitulo, COLUNAS[chave], linhas)
      else if (formato === 'excel') exportarExcel(info.titulo, COLUNAS[chave], linhas)
      else setPrevia({ chave, titulo: info.titulo, linhas })
      setConfigurando(null)
    } catch (e) {
      toast.erro(mensagemErro(e))
    } finally {
      setGerando(null)
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold">Relatórios</h1>
        <div className="mt-1 text-[13px] text-muted">
          Exporte dados para análise e prestação de contas.
        </div>
      </div>

      {CATEGORIAS.map((categoria) => (
        <section key={categoria} className="mb-5">
          <div className="eyebrow mb-2.5">{categoria}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {RELATORIOS.filter((r) => r.categoria === categoria).map(
              ({ chave, titulo, descricao, filtros: aceita, Icone, iconBg, iconFg, requisito }) => (
          <div key={chave} className="card flex flex-col p-[18px]">
            <div className="flex items-start justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-[9px]"
                style={{ background: iconBg, color: iconFg }}
              >
                <Icone size={17} />
              </div>
              {/* Os codigos de regra de negocio ficam so na documentacao */}
              {!requisito.startsWith('RN') && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-soft">
                  {requisito}
                </span>
              )}
            </div>
            <div className="mt-3 text-[14px] font-semibold">{titulo}</div>
            <div className="mt-1 flex-1 text-[12px] leading-[1.5] text-muted">{descricao}</div>

            {aceita.length > 0 && (
              <div className="mt-2.5 text-[11px] text-soft">
                Filtros: {aceita.map((k) => ROTULO_FILTRO[k]).join(', ')}
              </div>
            )}

            <div className="mt-3.5 flex gap-1.5">
              <button
                onClick={() => {
                  setFiltros(FILTROS_VAZIOS)
                  gerar(chave, 'previa')
                }}
                disabled={gerando === chave}
                className="flex-1 rounded-field border border-edge py-1.5 text-[12px] hover:bg-bg disabled:opacity-50"
              >
                {gerando === chave ? 'Gerando…' : 'Gerar sem filtro'}
              </button>
              <button
                onClick={() => {
                  // Os filtros são um estado só, compartilhado pelos dez
                  // relatórios. Sem limpar na troca, um recorte de período
                  // feito em Frequência seguiria aplicado no Log — um filtro
                  // fantasma em relatório de prestação de contas é pior que
                  // um erro visível.
                  setFiltros(FILTROS_VAZIOS)
                  setConfigurando(chave)
                }}
                disabled={gerando === chave}
                className="flex-[1.4] rounded-field bg-primary py-1.5 text-[12px] font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                {aceita.length > 0 ? 'Filtrar e gerar' : 'Exportar'}
              </button>
            </div>
          </div>
              ),
            )}
          </div>
        </section>
      ))}

      {/*
        Filtros contextuais: cada relatório mostra apenas o que ele
        realmente aplica. A barra fixa anterior exibia seis campos, e
        parte deles não tinha efeito nenhum no relatório escolhido.
      */}
      <Modal
        aberto={meta !== null}
        titulo={meta?.titulo ?? ''}
        descricao={
          meta?.filtros.length
            ? 'Refine o recorte antes de gerar. Campos em branco não filtram.'
            : 'Este relatório não usa filtros — escolha o formato de saída.'
        }
        largura={620}
        onFechar={() => setConfigurando(null)}
        rodape={
          <>
            <button
              onClick={() => setFiltros(FILTROS_VAZIOS)}
              className="btn-ghost mr-auto"
              disabled={!meta?.filtros.length}
            >
              Limpar filtros
            </button>
            <button
              onClick={() => meta && gerar(meta.chave, 'excel')}
              disabled={gerando !== null}
              className="btn-ghost"
            >
              Excel
            </button>
            <button
              onClick={() => meta && gerar(meta.chave, 'pdf')}
              disabled={gerando !== null}
              className="btn-ghost"
            >
              PDF
            </button>
            <button
              onClick={() => meta && gerar(meta.chave, 'previa')}
              disabled={gerando !== null}
              className="btn-primary"
            >
              {gerando ? 'Gerando…' : 'Visualizar'}
            </button>
          </>
        }
      >
        {meta && meta.filtros.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {meta.filtros.includes('periodo') && (
              <>
                <label>
                  <span className="field-label">Início</span>
                  <input
                    type="date"
                    value={filtros.inicio}
                    onChange={(e) => setFiltros({ ...filtros, inicio: e.target.value })}
                    className="field"
                  />
                </label>
                <label>
                  <span className="field-label">Fim</span>
                  <input
                    type="date"
                    value={filtros.fim}
                    onChange={(e) => setFiltros({ ...filtros, fim: e.target.value })}
                    className="field"
                  />
                </label>
              </>
            )}

            {meta.filtros.includes('rota') && (
              <label>
                <span className="field-label">Rota</span>
                <select
                  value={filtros.rotaId}
                  onChange={(e) => setFiltros({ ...filtros, rotaId: e.target.value })}
                  className="field"
                >
                  <option value="">Todas</option>
                  {rotas?.map((r) => (
                    <option key={r.rota_id} value={r.rota_id}>
                      {r.codigo} · {r.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {meta.filtros.includes('veiculo') && (
              <label>
                <span className="field-label">Veículo</span>
                <select
                  value={filtros.veiculoId}
                  onChange={(e) => setFiltros({ ...filtros, veiculoId: e.target.value })}
                  className="field"
                >
                  <option value="">Todos</option>
                  {veiculos?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} · {v.modelo}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {meta.filtros.includes('motorista') && (
              <label>
                <span className="field-label">Motorista</span>
                <select
                  value={filtros.motoristaId}
                  onChange={(e) => setFiltros({ ...filtros, motoristaId: e.target.value })}
                  className="field"
                >
                  <option value="">Todos</option>
                  {motoristas?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {meta.filtros.includes('universidade') && (
              <label>
                <span className="field-label">Universidade</span>
                <select
                  value={filtros.universidadeId}
                  onChange={(e) => setFiltros({ ...filtros, universidadeId: e.target.value })}
                  className="field"
                >
                  <option value="">Todas</option>
                  {universidades?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {meta.filtros.includes('perfilUso') && (
              <label>
                <span className="field-label">Perfil de uso</span>
                <select
                  value={filtros.perfilUso}
                  onChange={(e) => setFiltros({ ...filtros, perfilUso: e.target.value })}
                  className="field"
                >
                  <option value="">Todos</option>
                  <option value="ida_volta">Ida e volta</option>
                  <option value="somente_ida">Somente ida</option>
                  <option value="somente_volta">Somente volta</option>
                </select>
              </label>
            )}

            {meta.filtros.includes('statusDocumental') && (
              <label>
                <span className="field-label">Documentação</span>
                <select
                  value={filtros.statusDocumental}
                  onChange={(e) => setFiltros({ ...filtros, statusDocumental: e.target.value })}
                  className="field"
                >
                  <option value="">Todas</option>
                  <option value="aprovado">Aprovada</option>
                  <option value="pendente">Pendente</option>
                  <option value="rejeitado">Rejeitada</option>
                </select>
              </label>
            )}

            {meta.filtros.includes('statusVeiculo') && (
              <label>
                <span className="field-label">Situação do veículo</span>
                <select
                  value={filtros.statusVeiculo}
                  onChange={(e) => setFiltros({ ...filtros, statusVeiculo: e.target.value })}
                  className="field"
                >
                  <option value="">Todas</option>
                  <option value="disponivel">Disponível</option>
                  <option value="em_rota">Em rota</option>
                  <option value="manutencao">Manutenção</option>
                </select>
              </label>
            )}

            {meta.filtros.includes('situacaoMotorista') && (
              <label>
                <span className="field-label">Situação do motorista</span>
                <select
                  value={filtros.situacaoMotorista}
                  onChange={(e) => setFiltros({ ...filtros, situacaoMotorista: e.target.value })}
                  className="field"
                >
                  <option value="">Todas</option>
                  <option value="ativo">Ativo</option>
                  <option value="ferias">Férias</option>
                  <option value="afastado">Afastado</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            )}

            {meta.filtros.includes('grade') && (
              <div className="rounded-field border border-edge p-3 sm:col-span-2">
                <div className="field-label">Horário de aula</div>
                <p className="mb-2.5 text-[11.5px] text-muted">
                  Traz os estudantes cuja aula <b>termina</b> dentro da faixa — é o recorte usado
                  para planejar o horário de retorno.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label>
                    <span className="field-label">Dia da semana</span>
                    <select
                      value={filtros.diaSemana}
                      onChange={(e) => setFiltros({ ...filtros, diaSemana: e.target.value })}
                      className="field"
                    >
                      <option value="">Qualquer dia</option>
                      {DIAS_SEMANA.map((d) => (
                        <option key={d.numero} value={String(d.numero)}>
                          {d.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Sai a partir de</span>
                    <input
                      type="time"
                      value={filtros.horaInicio}
                      onChange={(e) => setFiltros({ ...filtros, horaInicio: e.target.value })}
                      className="field"
                    />
                  </label>
                  <label>
                    <span className="field-label">Sai até</span>
                    <input
                      type="time"
                      value={filtros.horaFim}
                      onChange={(e) => setFiltros({ ...filtros, horaFim: e.target.value })}
                      className="field"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">
            Escolha o formato no rodapé. A lista sai completa, na ordem de cadastro.
          </p>
        )}
      </Modal>

      {/* Prévia */}
      <Modal
        aberto={previa !== null}
        titulo={previa?.titulo ?? ''}
        descricao={`${previa?.linhas.length ?? 0} registro(s) · ${subtitulo}`}
        largura={1100}
        onFechar={() => setPrevia(null)}
        rodape={
          <>
            <button onClick={() => setPrevia(null)} className="btn-ghost">
              Fechar
            </button>
            <button
              onClick={() =>
                previa && exportarExcel(previa.titulo, COLUNAS[previa.chave], previa.linhas)
              }
              className="btn-ghost"
            >
              Exportar Excel
            </button>
            <button
              onClick={() =>
                previa && exportarPDF(previa.titulo, subtitulo, COLUNAS[previa.chave], previa.linhas)
              }
              className="btn-primary"
            >
              Exportar PDF
            </button>
          </>
        }
      >
        {previa && (
          <div className="max-h-[55vh] overflow-auto rounded-card border border-edge">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-edge">
                  {COLUNAS[previa.chave].map((c) => (
                    <th key={c.chave} className="th whitespace-nowrap">
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.slice(0, 200).map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {COLUNAS[previa.chave].map((c) => (
                      <td key={c.chave} className="td whitespace-nowrap">
                        {String(l[c.chave] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previa.linhas.length > 200 && (
              <div className="border-t border-line px-4 py-2.5 text-center text-[11.5px] text-muted">
                Mostrando 200 de {previa.linhas.length} registros, a exportação inclui todos.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function montarSubtitulo(
  f: Filtros,
  rotas?: { rota_id: string; codigo: string }[],
  veiculos?: { id: string; placa: string }[],
  motoristas?: { id: string; nome: string }[],
  universidades?: { id: string; nome: string }[],
): string {
  const partes: string[] = []
  if (f.inicio || f.fim) {
    partes.push(`Período: ${f.inicio ? dataBR(f.inicio) : 'início'} a ${f.fim ? dataBR(f.fim) : 'hoje'}`)
  }
  const rota = rotas?.find((r) => r.rota_id === f.rotaId)
  if (rota) partes.push(`Rota ${rota.codigo}`)
  const veiculo = veiculos?.find((v) => v.id === f.veiculoId)
  if (veiculo) partes.push(`Veículo ${veiculo.placa}`)
  const motorista = motoristas?.find((m) => m.id === f.motoristaId)
  if (motorista) partes.push(`Motorista ${motorista.nome}`)
  const uni = universidades?.find((u) => u.id === f.universidadeId)
  if (uni) partes.push(uni.nome)
  return partes.length ? partes.join(' · ') : 'Sem filtros aplicados'
}
