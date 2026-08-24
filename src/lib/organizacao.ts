import type { DefinicaoCampo } from '../components/ui/Campo'
import { ROTULO_TIPO_ORGANIZACAO, type TipoOrganizacao } from './types'

/**
 * Cadastro institucional descrito como dados (migration 0009).
 *
 * São cerca de 70 campos exigidos pela legislação do transporte escolar.
 * Escrevê-los como JSX transformaria a tela de configurações em mais de
 * mil linhas; aqui cada bloco é um objeto e a tela apenas percorre a
 * lista. Cada bloco tem seu próprio botão de salvar, com PATCH parcial —
 * um formulário único de 70 campos com um só submit é a receita para
 * perder o que o usuário digitou.
 */
export interface BlocoOrganizacao {
  chave: string
  rotulo: string
  ajuda: string
  /** Blocos com listas ou upload são desenhados à mão pela tela. */
  especial?: 'universidades' | 'abrangencia' | 'turnos' | 'identidade'
  campos: DefinicaoCampo[]
}

const TIPOS = (Object.keys(ROTULO_TIPO_ORGANIZACAO) as TipoOrganizacao[]).map((v) => ({
  valor: v,
  rotulo: ROTULO_TIPO_ORGANIZACAO[v],
}))

function opcoes(...valores: string[]) {
  return valores.map((v) => ({ valor: v, rotulo: v }))
}

export const BLOCOS_ORGANIZACAO: BlocoOrganizacao[] = [
  {
    chave: 'juridico',
    rotulo: 'Dados jurídicos e fiscais',
    ajuda: 'Identificação legal de quem responde pelo serviço de transporte.',
    campos: [
      { chave: 'razao_social', rotulo: 'Razão social', colSpan: 2 },
      { chave: 'nome_fantasia', rotulo: 'Nome fantasia', colSpan: 2 },
      { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj', placeholder: '00.000.000/0000-00' },
      { chave: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
      { chave: 'inscricao_municipal', rotulo: 'Inscrição municipal' },
      { chave: 'cnae', rotulo: 'CNAE', placeholder: '4921-3/01' },
      {
        chave: 'regime_tributario',
        rotulo: 'Regime tributário',
        tipo: 'select',
        opcoes: opcoes('Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Imune ou isento'),
      },
      {
        chave: 'unidade_gestora',
        rotulo: 'Código da unidade gestora',
        ajuda: 'Preencher quando o operador for órgão público.',
      },
      {
        chave: 'vinculo_administrativo',
        rotulo: 'Vínculo administrativo',
        colSpan: 2,
        placeholder: 'Secretaria Municipal de Educação',
      },
    ],
  },
  {
    chave: 'tipo',
    rotulo: 'Tipo de organização',
    ajuda:
      'Define as responsabilidades legais e quais fluxos o sistema cobra — o contrato, por exemplo, só faz sentido no serviço terceirizado.',
    campos: [
      { chave: 'tipo_organizacao', rotulo: 'Quem opera o transporte', tipo: 'select', opcoes: TIPOS, colSpan: 2 },
    ],
  },
  {
    chave: 'contato',
    rotulo: 'Endereço e contato',
    ajuda: 'Sede do serviço e o gestor que opera o sistema no dia a dia.',
    campos: [
      { chave: 'cep', rotulo: 'CEP', tipo: 'cep' },
      { chave: 'logradouro', rotulo: 'Logradouro', colSpan: 2 },
      { chave: 'numero', rotulo: 'Número' },
      { chave: 'complemento', rotulo: 'Complemento' },
      { chave: 'bairro', rotulo: 'Bairro' },
      { chave: 'uf', rotulo: 'UF', placeholder: 'SP' },
      { chave: 'telefone', rotulo: 'Telefone', tipo: 'telefone' },
      { chave: 'email', rotulo: 'E-mail institucional', tipo: 'email' },
      { chave: 'site', rotulo: 'Site', placeholder: 'https://' },
      { chave: 'gestor_nome', rotulo: 'Gestor de transporte escolar' },
      { chave: 'gestor_cargo', rotulo: 'Cargo do gestor' },
      { chave: 'gestor_telefone', rotulo: 'Telefone do gestor', tipo: 'telefone' },
      { chave: 'gestor_email', rotulo: 'E-mail do gestor', tipo: 'email' },
    ],
  },
  {
    chave: 'contrato',
    rotulo: 'Dados do contrato',
    ajuda:
      'Preencher quando o transporte for terceirizado. Permite ao sistema controlar prazos e obrigações contratuais.',
    campos: [
      { chave: 'contrato_numero', rotulo: 'Número do contrato' },
      { chave: 'contrato_licitacao', rotulo: 'Número da licitação' },
      {
        chave: 'contrato_modalidade',
        rotulo: 'Modalidade',
        tipo: 'select',
        opcoes: opcoes('Pregão', 'Dispensa', 'Chamada pública', 'Inexigibilidade', 'Concorrência'),
      },
      { chave: 'contrato_orgao', rotulo: 'Órgão contratante' },
      { chave: 'contrato_inicio', rotulo: 'Início da vigência', tipo: 'data' },
      { chave: 'contrato_fim', rotulo: 'Fim da vigência', tipo: 'data' },
      { chave: 'contrato_valor', rotulo: 'Valor contratado (R$)', tipo: 'moeda' },
      { chave: 'contrato_fiscal_nome', rotulo: 'Fiscal do contrato' },
      { chave: 'contrato_fiscal_matricula', rotulo: 'Matrícula do fiscal' },
      {
        chave: 'contrato_sla',
        rotulo: 'Cláusulas de SLA',
        tipo: 'textarea',
        colSpan: 2,
        placeholder: 'Pontualidade, condições do veículo, prazos de substituição…',
      },
    ],
  },
  {
    chave: 'abrangencia',
    rotulo: 'Abrangência geográfica',
    ajuda:
      'A área rural costuma ser o maior desafio logístico do transporte escolar, então mapear a cobertura é essencial.',
    especial: 'abrangencia',
    campos: [
      {
        chave: 'zona_atuacao',
        rotulo: 'Zona de atuação',
        tipo: 'select',
        opcoes: opcoes('Urbana', 'Rural', 'Urbana e rural'),
      },
      { chave: 'distritos_atendidos', rotulo: 'Distritos e comunidades', colSpan: 2 },
      {
        chave: 'abrangencia_descricao',
        rotulo: 'Observações da cobertura',
        tipo: 'textarea',
        colSpan: 2,
      },
    ],
  },
  {
    chave: 'educacional',
    rotulo: 'Instituições atendidas',
    ajuda: 'Alimenta o planejamento de rotas e horários.',
    especial: 'universidades',
    campos: [
      { chave: 'periodo_letivo_inicio', rotulo: 'Início do período letivo', tipo: 'data' },
      { chave: 'periodo_letivo_fim', rotulo: 'Fim do período letivo', tipo: 'data' },
    ],
  },
  {
    chave: 'licencas',
    rotulo: 'Licenças e autorizações',
    ajuda:
      'A vistoria semestral dos veículos é obrigatória no transporte escolar; o sistema usa estas datas para avisar dos vencimentos.',
    campos: [
      { chave: 'detran_registro', rotulo: 'Autorização do DETRAN' },
      { chave: 'detran_validade', rotulo: 'Validade da autorização', tipo: 'data' },
      { chave: 'alvara_numero', rotulo: 'Alvará de funcionamento' },
      { chave: 'alvara_validade', rotulo: 'Validade do alvará', tipo: 'data' },
      { chave: 'autorizacao_municipal', rotulo: 'Autorização municipal do serviço', colSpan: 2 },
      { chave: 'vistoria_ultima', rotulo: 'Última vistoria semestral', tipo: 'data' },
      { chave: 'vistoria_proxima', rotulo: 'Próxima vistoria', tipo: 'data' },
    ],
  },
  {
    chave: 'responsaveis',
    rotulo: 'Responsáveis legais e técnicos',
    ajuda:
      'Em prefeituras, é comum haver um responsável na secretaria de educação e outro na de transporte.',
    campos: [
      { chave: 'responsavel_legal_nome', rotulo: 'Representante legal' },
      { chave: 'responsavel_legal_cpf', rotulo: 'CPF do representante', tipo: 'cpf' },
      { chave: 'responsavel_legal_email', rotulo: 'E-mail do representante', tipo: 'email', colSpan: 2 },
      { chave: 'responsavel_tecnico_nome', rotulo: 'Responsável técnico pela frota' },
      { chave: 'responsavel_tecnico_registro', rotulo: 'Registro profissional' },
      { chave: 'responsavel_tecnico_email', rotulo: 'E-mail do responsável técnico', tipo: 'email', colSpan: 2 },
      { chave: 'coordenador_nome', rotulo: 'Coordenador de transporte escolar' },
      { chave: 'coordenador_email', rotulo: 'E-mail do coordenador', tipo: 'email' },
    ],
  },
  {
    chave: 'seguros',
    rotulo: 'Seguros obrigatórios',
    ajuda:
      'Controle crítico: veículo sem seguro de responsabilidade civil válido não pode circular (exigência do CTB).',
    campos: [
      { chave: 'seguradora', rotulo: 'Seguradora', colSpan: 2 },
      { chave: 'apolice_numero', rotulo: 'Número da apólice (RC)' },
      { chave: 'apolice_valor_cobertura', rotulo: 'Valor da cobertura (R$)', tipo: 'moeda' },
      { chave: 'apolice_inicio', rotulo: 'Início da vigência', tipo: 'data' },
      { chave: 'apolice_fim', rotulo: 'Fim da vigência', tipo: 'data' },
      {
        chave: 'app_numero',
        rotulo: 'Apólice APP',
        ajuda: 'Acidentes Pessoais de Passageiros.',
      },
      { chave: 'app_valor', rotulo: 'Cobertura da APP (R$)', tipo: 'moeda' },
    ],
  },
  {
    chave: 'operacional',
    rotulo: 'Parâmetros operacionais',
    ajuda:
      'Turnos atendidos, tempo máximo de permanência do aluno no veículo e política de acompanhamento.',
    especial: 'turnos',
    campos: [
      {
        chave: 'tempo_maximo_veiculo_min',
        rotulo: 'Tempo máximo no veículo (minutos)',
        tipo: 'numero',
        ajuda: 'Muitos municípios definem um limite por viagem.',
      },
      {
        chave: 'monitor_obrigatorio',
        rotulo: 'Monitor obrigatório no veículo',
        tipo: 'booleano',
        colSpan: 2,
      },
    ],
  },
  {
    chave: 'canais',
    rotulo: 'Canais de comunicação',
    ajuda: 'Como responsáveis e escolas falam com o setor de transporte.',
    campos: [
      { chave: 'canal_ouvidoria', rotulo: 'Ouvidoria', tipo: 'telefone' },
      { chave: 'canal_sac', rotulo: 'SAC / reclamações', tipo: 'telefone' },
      { chave: 'canal_whatsapp', rotulo: 'WhatsApp', tipo: 'telefone' },
      { chave: 'canal_email', rotulo: 'E-mail para responsáveis', tipo: 'email' },
      { chave: 'horario_atendimento', rotulo: 'Horário de atendimento', placeholder: 'Seg a sex, 8h às 17h' },
      { chave: 'aplicativo_pais', rotulo: 'Aplicativo de acompanhamento', placeholder: 'Link ou nome do app' },
    ],
  },
  {
    chave: 'fiscalizacao',
    rotulo: 'Dados de fiscalização',
    ajuda: 'Histórico de vistorias, autuações e pendências junto ao órgão fiscalizador.',
    campos: [
      {
        chave: 'orgao_fiscalizador',
        rotulo: 'Órgão fiscalizador',
        tipo: 'select',
        opcoes: opcoes('DETRAN', 'Prefeitura', 'Conselho de transporte', 'Outro'),
      },
      {
        chave: 'fiscalizacao_frequencia',
        rotulo: 'Frequência das vistorias',
        tipo: 'select',
        opcoes: opcoes('Mensal', 'Trimestral', 'Semestral', 'Anual', 'Eventual'),
      },
      { chave: 'fiscalizacao_ultima', rotulo: 'Última fiscalização', tipo: 'data' },
      {
        chave: 'fiscalizacao_observacoes',
        rotulo: 'Autuações e pendências',
        tipo: 'textarea',
        colSpan: 2,
      },
    ],
  },
  {
    chave: 'identidade',
    rotulo: 'Logotipo e identidade',
    ajuda:
      'Usados nos relatórios, comunicados aos responsáveis, carteirinhas dos estudantes e adesivos dos veículos.',
    especial: 'identidade',
    campos: [],
  },
]

/** Campos de vigência que valem um alerta quando estão perto de vencer. */
export const VENCIMENTOS_ORGANIZACAO: { chave: string; rotulo: string }[] = [
  { chave: 'contrato_fim', rotulo: 'Contrato' },
  { chave: 'apolice_fim', rotulo: 'Apólice de responsabilidade civil' },
  { chave: 'detran_validade', rotulo: 'Autorização do DETRAN' },
  { chave: 'alvara_validade', rotulo: 'Alvará de funcionamento' },
  { chave: 'vistoria_proxima', rotulo: 'Vistoria semestral' },
]
