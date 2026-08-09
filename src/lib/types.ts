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

export interface Perfil {
  id: string
  nome: string
  email: string
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
  cidade?: Cidade | null
}

export interface Estudante {
  id: string
  perfil_id: string | null
  nome: string
  ra: string
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
  universidade_id: string | null
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
  universidade?: Pick<Universidade, 'id' | 'nome'> | null
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
  estudante?: Pick<Estudante, 'id' | 'nome' | 'ra' | 'curso' | 'perfil_uso'> | null
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

export interface ResultadoDistribuicao {
  alocados: number
  fila_espera: number
  sem_rota: number
  duracao_ms: number
  mensagens: { tipo: 'sucesso' | 'alerta' | 'erro'; texto: string }[]
}

/** Retorno da função minha_rota() — tela "Minha Rota" do estudante (RF11). */
export interface MinhaRota {
  estudante: {
    id: string
    nome: string
    ra: string
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
