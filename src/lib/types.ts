// Tipos do dominio GTPORTE, espelhando supabase/migrations/

export type TipoPerfil = 'admin' | 'operador' | 'motorista' | 'estudante'
export type PerfilUso = 'ida_volta' | 'somente_ida' | 'somente_volta'
export type StatusDocumental = 'pendente' | 'aprovado' | 'rejeitado'
export type TipoDocumento = 'rg' | 'cpf' | 'matricula' | 'residencia'
export type StatusMotorista = 'em_rota' | 'aguardando' | 'folga' | 'inativo'
export type StatusVeiculo = 'em_rota' | 'disponivel' | 'manutencao'
export type StatusRota = 'ativa' | 'lotada' | 'revisao' | 'inativa'
export type SituacaoOperacional = 'aguardando' | 'em_rota' | 'concluida'
export type SituacaoAlocacao = 'alocado' | 'fila_espera' | 'sem_rota'
export type OrigemAlocacao = 'automatica' | 'manual'

// --- Adicionados nas migrations 0009 a 0012 ---
export type SituacaoMotorista = 'ativo' | 'inativo' | 'ferias' | 'afastado'
export type VinculoMotorista = 'clt' | 'terceirizado' | 'autonomo' | 'estatutario'
export type ResultadoExame = 'apto' | 'apto_com_restricao' | 'inapto' | 'pendente'
export type TipoCursoMotorista =
  | 'mopp'
  | 'transporte_coletivo'
  | 'direcao_defensiva'
  | 'primeiros_socorros'
  | 'outro'
export type TipoDocumentoMotorista =
  | 'cnh_frente'
  | 'cnh_verso'
  | 'residencia'
  | 'toxicologico'
  | 'aso'
  | 'certificado'
  | 'contrato'
  | 'outro'
export type SolicitacaoStatus = 'pendente' | 'aprovada' | 'recusada' | 'cancelada'
export type TipoOrganizacao =
  | 'prefeitura'
  | 'secretaria_educacao'
  | 'empresa_terceirizada'
  | 'cooperativa'
  | 'instituicao_privada'

export interface Perfil {
  id: string
  nome: string
  email: string
  /** Identificador de acesso definido pelo administrador (RF20). */
  login: string | null
  telefone: string | null
  tipo: TipoPerfil
  ativo: boolean
  ultimo_acesso: string | null
  criado_em: string
}

export interface Cidade {
  id: string
  nome: string
  uf: string
}

export interface Universidade {
  id: string
  nome: string
  cidade_id: string
  cor: string
  ativa: boolean
  /** Endereço do campus (migration 0008). */
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  cidade?: Cidade | null
}

export interface Estudante {
  id: string
  perfil_id: string | null
  nome: string
  prontuario: string
  cpf: string
  data_nascimento: string | null
  telefone: string | null
  email: string | null
  curso: string | null
  endereco: string | null
  universidade_id: string
  cidade_id: string
  perfil_uso: PerfilUso
  status_documental: StatusDocumental
  ativo: boolean
  criado_em: string
  /** Caminho da foto no bucket documentos (migration 0008). */
  foto_path: string | null
  universidade?: Pick<Universidade, 'id' | 'nome' | 'cor'> | null
  cidade?: Pick<Cidade, 'id' | 'nome'> | null
}

export interface Motorista {
  id: string
  perfil_id: string | null
  nome: string
  cnh: string
  categoria_cnh: string
  validade_cnh: string | null
  telefone: string | null
  status: StatusMotorista
  ativo: boolean

  // Dados pessoais (0011)
  cpf: string | null
  rg: string | null
  data_nascimento: string | null
  estado_civil: string | null
  email: string | null
  foto_path: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade_id: string | null
  uf: string | null
  cep: string | null

  // CNH
  cnh_emissao: string | null
  cnh_orgao_emissor: string | null
  cnh_ear: boolean

  // Exames e aptidao
  toxicologico_data: string | null
  toxicologico_validade: string | null
  toxicologico_resultado: ResultadoExame | null
  aso_data: string | null
  aso_validade: string | null

  // Profissional e contratual
  data_admissao: string | null
  vinculo: VinculoMotorista | null
  cargo: string | null
  setor: string | null
  matricula_interna: string | null
  gestor_responsavel: string | null

  // Controle
  situacao: SituacaoMotorista
  observacoes: string | null
  status_documental: StatusDocumental
  atualizado_em?: string | null
}

export interface MotoristaCurso {
  id: string
  motorista_id: string
  tipo: TipoCursoMotorista
  descricao: string | null
  instituicao: string | null
  conclusao: string | null
  validade: string | null
}

export interface MotoristaContatoEmergencia {
  id: string
  motorista_id: string
  nome: string
  parentesco: string | null
  telefone: string
}

export interface DocumentoMotorista {
  id: string
  motorista_id: string
  tipo: TipoDocumentoMotorista
  nome_arquivo: string
  storage_path: string
  validade: string | null
  status: StatusDocumental
  observacao: string | null
  revisado_por: string | null
  revisado_em: string | null
  criado_em: string
}

export interface SolicitacaoVolta {
  id: string
  alocacao_id: string
  rota_id: string
  data: string
  justificativa: string
  status: SolicitacaoStatus
  motivo_recusa: string | null
  decidido_por: string | null
  decidido_em: string | null
  criado_em: string
}

export const ROTULO_SITUACAO_MOTORISTA: Record<SituacaoMotorista, string> = {
  ativo: 'Ativo',
  ferias: 'Férias',
  afastado: 'Afastado',
  inativo: 'Inativo',
}

export const ROTULO_VINCULO: Record<VinculoMotorista, string> = {
  clt: 'CLT',
  terceirizado: 'Terceirizado',
  autonomo: 'Autônomo',
  estatutario: 'Estatutário',
}

export const ROTULO_RESULTADO_EXAME: Record<ResultadoExame, string> = {
  apto: 'Apto',
  apto_com_restricao: 'Apto com restrição',
  inapto: 'Inapto',
  pendente: 'Pendente',
}

export const ROTULO_CURSO: Record<TipoCursoMotorista, string> = {
  mopp: 'MOPP',
  transporte_coletivo: 'Transporte coletivo de passageiros',
  direcao_defensiva: 'Direção defensiva',
  primeiros_socorros: 'Primeiros socorros',
  outro: 'Outro curso',
}

export const ROTULO_DOCUMENTO_MOTORISTA: Record<TipoDocumentoMotorista, string> = {
  cnh_frente: 'CNH (frente)',
  cnh_verso: 'CNH (verso)',
  residencia: 'Comprovante de residência',
  toxicologico: 'Exame toxicológico',
  aso: 'Atestado de saúde ocupacional',
  certificado: 'Certificado de curso',
  contrato: 'Contrato de trabalho',
  outro: 'Outro documento',
}

export const SIGLA_DOCUMENTO_MOTORISTA: Record<TipoDocumentoMotorista, string> = {
  cnh_frente: 'CNH-F',
  cnh_verso: 'CNH-V',
  residencia: 'RES',
  toxicologico: 'TOX',
  aso: 'ASO',
  certificado: 'CERT',
  contrato: 'CONT',
  outro: 'OUT',
}

/** Os quatro que definem o status documental do motorista (migration 0010). */
export const DOCUMENTOS_MOTORISTA_OBRIGATORIOS: TipoDocumentoMotorista[] = [
  'cnh_frente',
  'cnh_verso',
  'residencia',
  'toxicologico',
]

/** Tipos que aceitam mais de um arquivo por motorista. */
export const DOCUMENTOS_MOTORISTA_REPETIVEIS: TipoDocumentoMotorista[] = ['certificado', 'outro']

export const ROTULO_SOLICITACAO_VOLTA: Record<SolicitacaoStatus, string> = {
  pendente: 'Aguardando o motorista',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
}

export const ROTULO_TIPO_ORGANIZACAO: Record<TipoOrganizacao, string> = {
  prefeitura: 'Prefeitura municipal',
  secretaria_educacao: 'Secretaria de educação',
  empresa_terceirizada: 'Empresa terceirizada contratada',
  cooperativa: 'Cooperativa de transportadores',
  instituicao_privada: 'Instituição de ensino privada',
}

export interface Veiculo {
  id: string
  placa: string
  modelo: string
  ano: number | null
  capacidade_maxima: number
  status: StatusVeiculo
  observacao: string | null
}

export interface Rota {
  id: string
  codigo: string
  nome: string
  cidade_origem_id: string
  cidade_destino_id: string
  veiculo_id: string
  motorista_id: string
  horario_partida: string
  horario_retorno: string
  descricao: string | null
  status: StatusRota
  situacao_operacional: SituacaoOperacional
  situacao_atualizada_em: string | null
  origem?: Pick<Cidade, 'id' | 'nome'> | null
  destino?: Pick<Cidade, 'id' | 'nome'> | null
  veiculo?: Pick<Veiculo, 'id' | 'placa' | 'modelo' | 'capacidade_maxima'> | null
  motorista?: Pick<Motorista, 'id' | 'nome'> | null
  /** Universidades atendidas. Lista vazia significa que a rota atende todas. */
  universidades?: { universidade: Pick<Universidade, 'id' | 'nome'> | null }[]
}

export interface Documento {
  id: string
  estudante_id: string
  tipo: TipoDocumento
  nome_arquivo: string
  storage_path: string
  status: StatusDocumental
  observacao: string | null
  revisado_por: string | null
  revisado_em: string | null
  criado_em: string
}

export interface GradeHoraria {
  id: string
  estudante_id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
}

export interface Alocacao {
  id: string
  estudante_id: string
  rota_id: string | null
  situacao: SituacaoAlocacao
  origem: OrigemAlocacao
  ativa: boolean
  motivo: string | null
  criado_em: string
  encerrado_em: string | null
  estudante?: Pick<Estudante, 'id' | 'nome' | 'prontuario' | 'curso' | 'perfil_uso'> | null
  rota?: Pick<Rota, 'id' | 'codigo' | 'nome'> | null
}

export interface Presenca {
  id: string
  alocacao_id: string
  data: string
  confirmou_ida: boolean
  hora_ida: string | null
  confirmou_volta: boolean
  hora_volta: string | null
  cancelou_ida: boolean
  motivo_cancelamento_ida: string | null
  cancelado_ida_em: string | null
  cancelou_volta: boolean
  motivo_cancelamento_volta: string | null
  cancelado_volta_em: string | null
}

export type TipoMensagem = 'mensagem' | 'solicitacao'
export type StatusMensagem = 'aberta' | 'respondida' | 'encerrada'

export interface Mensagem {
  id: string
  remetente_id: string | null
  /** Nulo significa que a mensagem foi endereçada ao setor de transporte. */
  destinatario_id: string | null
  responde_a: string | null
  tipo: TipoMensagem
  status: StatusMensagem
  assunto: string
  corpo: string
  lida_em: string | null
  criado_em: string
  remetente?: Pick<Perfil, 'id' | 'nome' | 'tipo'> | null
  destinatario?: Pick<Perfil, 'id' | 'nome' | 'tipo'> | null
}

export interface MensagemModelo {
  id: string
  titulo: string
  assunto: string
  corpo: string
  automatica: boolean
  evento: string | null
}

export interface ConfiguracaoSistema {
  chave: string
  valor: string
  descricao: string | null
}

export interface AvisoRota {
  id: string
  rota_id: string
  autor_id: string | null
  mensagem: string
  criado_em: string
}

export interface OcupacaoRota {
  rota_id: string
  codigo: string
  nome: string
  status: StatusRota
  horario_partida: string
  horario_retorno: string
  placa: string
  modelo: string
  capacidade_maxima: number
  motorista: string
  ocupacao: number
  percentual: number | null
  situacao_operacional: SituacaoOperacional
  situacao_atualizada_em: string | null
}

export interface RotaMotorista {
  rota_id: string
  codigo: string
  nome: string
  horario_partida: string
  horario_retorno: string
  status: StatusRota
  situacao_operacional: SituacaoOperacional
  situacao_atualizada_em: string | null
  motorista_id: string
  origem: string | null
  destino: string | null
  placa: string
  modelo: string
  capacidade_maxima: number
  passageiros: number
}

export interface LogAdministrativo {
  id: string
  perfil_id: string | null
  acao: string
  entidade: string
  entidade_id: string | null
  detalhe: Record<string, unknown> | null
  criado_em: string
}

/** Mensagem devolvida por executar_distribuicao().
 *  0003_funcoes.sql retornava objetos; 0006_ajustes.sql passou a retornar
 *  strings puras — as duas formas continuam sendo aceitas pela tela. */
export type MensagemDistribuicao = string | { tipo: 'sucesso' | 'alerta' | 'erro'; texto: string }

export interface ResultadoDistribuicao {
  alocados: number
  fila_espera: number
  sem_rota: number
  duracao_ms: number
  mensagens: MensagemDistribuicao[]
}

/** Retorno da função minha_rota() — tela "Minha Rota" do estudante (RF11). */
export interface MinhaRota {
  estudante: {
    id: string
    nome: string
    prontuario: string
    curso: string | null
    perfil_uso: PerfilUso
    status_documental: StatusDocumental
    universidade: string | null
  }
  alocacao: {
    id: string
    situacao: SituacaoAlocacao
    origem: OrigemAlocacao
    motivo: string | null
  } | null
  rota: {
    id: string
    codigo: string
    nome: string
    horario_partida: string
    horario_retorno: string
    status: StatusRota
    situacao_operacional: SituacaoOperacional
    situacao_atualizada_em: string | null
    origem: string | null
    destino: string | null
    motorista: string | null
    motorista_telefone: string | null
    veiculo: string | null
    veiculo_modelo: string | null
    capacidade: number | null
  } | null
  presenca_hoje: {
    confirmou_ida: boolean
    hora_ida: string | null
    confirmou_volta: boolean
    hora_volta: string | null
  } | null
  /**
   * Solicitação de volta avulsa do dia corrente (migration 0012).
   * Vem junto na RPC para a tela do aluno não precisar de outra consulta.
   */
  solicitacao_volta: {
    id: string
    status: SolicitacaoStatus
    justificativa: string
    motivo_recusa: string | null
    decidido_em: string | null
    criado_em: string
  } | null
}

export const ROTULO_TIPO_PERFIL: Record<TipoPerfil, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  motorista: 'Motorista',
  estudante: 'Estudante',
}

export const ROTULO_PERFIL_USO: Record<PerfilUso, string> = {
  ida_volta: 'Ida e volta',
  somente_ida: 'Somente ida',
  somente_volta: 'Somente volta',
}

export const ROTULO_SITUACAO_OPERACIONAL: Record<SituacaoOperacional, string> = {
  aguardando: 'Aguardando',
  em_rota: 'Em rota',
  concluida: 'Concluída',
}

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  rg: 'RG',
  cpf: 'CPF',
  matricula: 'Comprovante de matrícula',
  residencia: 'Comprovante de residência',
}

export const SIGLA_DOCUMENTO: Record<TipoDocumento, string> = {
  rg: 'RG',
  cpf: 'CPF',
  matricula: 'MATR',
  residencia: 'RES',
}

export const TIPOS_DOCUMENTO: TipoDocumento[] = ['rg', 'cpf', 'matricula', 'residencia']

/**
 * Cadastro institucional (migration 0009). É um singleton: existe uma
 * única linha, criada pela própria migration.
 */
export interface Organizacao {
  id: string

  razao_social: string | null
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  inscricao_municipal: string | null
  cnae: string | null
  regime_tributario: string | null
  unidade_gestora: string | null
  vinculo_administrativo: string | null

  tipo_organizacao: TipoOrganizacao | null

  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade_id: string | null
  uf: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  site: string | null
  gestor_nome: string | null
  gestor_cargo: string | null
  gestor_telefone: string | null
  gestor_email: string | null

  contrato_numero: string | null
  contrato_licitacao: string | null
  contrato_modalidade: string | null
  contrato_inicio: string | null
  contrato_fim: string | null
  contrato_valor: number | null
  contrato_sla: string | null
  contrato_orgao: string | null
  contrato_fiscal_nome: string | null
  contrato_fiscal_matricula: string | null

  zona_atuacao: string | null
  abrangencia_descricao: string | null
  distritos_atendidos: string | null

  detran_registro: string | null
  detran_validade: string | null
  alvara_numero: string | null
  alvara_validade: string | null
  autorizacao_municipal: string | null
  vistoria_ultima: string | null
  vistoria_proxima: string | null

  responsavel_legal_nome: string | null
  responsavel_legal_cpf: string | null
  responsavel_legal_email: string | null
  responsavel_tecnico_nome: string | null
  responsavel_tecnico_registro: string | null
  responsavel_tecnico_email: string | null
  coordenador_nome: string | null
  coordenador_email: string | null

  seguradora: string | null
  apolice_numero: string | null
  apolice_inicio: string | null
  apolice_fim: string | null
  apolice_valor_cobertura: number | null
  app_numero: string | null
  app_valor: number | null

  turnos: TurnoOrganizacao[]
  tempo_maximo_veiculo_min: number | null
  monitor_obrigatorio: boolean
  periodo_letivo_inicio: string | null
  periodo_letivo_fim: string | null

  canal_ouvidoria: string | null
  canal_sac: string | null
  canal_email: string | null
  canal_whatsapp: string | null
  horario_atendimento: string | null
  aplicativo_pais: string | null

  orgao_fiscalizador: string | null
  fiscalizacao_frequencia: string | null
  fiscalizacao_ultima: string | null
  fiscalizacao_observacoes: string | null

  logo_path: string | null
  cor_primaria: string | null
  cor_secundaria: string | null

  atualizado_em: string
  atualizado_por: string | null
}

export interface TurnoOrganizacao {
  nome: string
  entrada: string
  saida: string
}

export interface OrganizacaoUniversidade {
  organizacao_id: string
  universidade_id: string
  convenio: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  universidade?: Pick<Universidade, 'id' | 'nome' | 'cor'> | null
}
