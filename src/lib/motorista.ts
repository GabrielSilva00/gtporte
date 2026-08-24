import type { DefinicaoCampo } from '../components/ui/Campo'
import {
  ROTULO_RESULTADO_EXAME,
  ROTULO_VINCULO,
  type ResultadoExame,
  type VinculoMotorista,
} from './types'

/**
 * Campos do cadastro de motorista descritos como dados, agrupados pelas
 * abas do formulário. Sem isso a tela viraria centenas de linhas de JSX
 * repetido — são cerca de 40 campos exigidos pela legislação de
 * transporte escolar.
 *
 * Apenas nome e CNH são obrigatórios para salvar (RN do próprio setor: o
 * cadastro é completado ao longo do tempo, conforme os documentos chegam).
 */
export type AbaMotorista =
  | 'pessoais'
  | 'cnh'
  | 'exames'
  | 'profissional'
  | 'cursos'
  | 'documentos'
  | 'contatos'

export const ABAS_MOTORISTA: { chave: AbaMotorista; rotulo: string }[] = [
  { chave: 'pessoais', rotulo: 'Dados pessoais' },
  { chave: 'cnh', rotulo: 'CNH' },
  { chave: 'exames', rotulo: 'Exames' },
  { chave: 'profissional', rotulo: 'Profissional' },
  { chave: 'cursos', rotulo: 'Cursos' },
  { chave: 'documentos', rotulo: 'Documentos' },
  { chave: 'contatos', rotulo: 'Emergência' },
]

const ESTADOS_CIVIS = [
  'Solteiro(a)',
  'Casado(a)',
  'União estável',
  'Divorciado(a)',
  'Viúvo(a)',
].map((v) => ({ valor: v, rotulo: v }))

export const CAMPOS_PESSOAIS: DefinicaoCampo[] = [
  { chave: 'cpf', rotulo: 'CPF', tipo: 'cpf', placeholder: '000.000.000-00' },
  { chave: 'rg', rotulo: 'RG', placeholder: '00.000.000-0' },
  { chave: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data' },
  { chave: 'estado_civil', rotulo: 'Estado civil', tipo: 'select', opcoes: ESTADOS_CIVIS },
  { chave: 'telefone', rotulo: 'Telefone', tipo: 'telefone', placeholder: '(18) 99999-0000' },
  { chave: 'email', rotulo: 'E-mail', tipo: 'email', placeholder: 'nome@exemplo.com' },
]

export const CAMPOS_ENDERECO: DefinicaoCampo[] = [
  { chave: 'cep', rotulo: 'CEP', tipo: 'cep', placeholder: '16050-000' },
  { chave: 'logradouro', rotulo: 'Logradouro', colSpan: 2, placeholder: 'Rua, avenida…' },
  { chave: 'numero', rotulo: 'Número' },
  { chave: 'complemento', rotulo: 'Complemento', placeholder: 'Apto, bloco…' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'uf', rotulo: 'UF', placeholder: 'SP' },
]

export const CAMPOS_CNH: DefinicaoCampo[] = [
  {
    chave: 'categoria_cnh',
    rotulo: 'Categoria',
    tipo: 'select',
    opcoes: ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'].map((c) => ({
      valor: c,
      rotulo: c,
    })),
    ajuda: 'Transporte de passageiros exige categoria D ou E.',
  },
  { chave: 'cnh_emissao', rotulo: 'Data de emissão', tipo: 'data' },
  { chave: 'validade_cnh', rotulo: 'Data de validade', tipo: 'data' },
  { chave: 'cnh_orgao_emissor', rotulo: 'Órgão emissor', placeholder: 'DETRAN-SP' },
  {
    chave: 'cnh_ear',
    rotulo: 'Exerce atividade remunerada (EAR)',
    tipo: 'booleano',
    colSpan: 2,
    ajuda: 'Obrigatório para quem dirige transporte de passageiros.',
  },
]

const RESULTADOS = (Object.keys(ROTULO_RESULTADO_EXAME) as ResultadoExame[]).map((v) => ({
  valor: v,
  rotulo: ROTULO_RESULTADO_EXAME[v],
}))

export const CAMPOS_EXAMES: DefinicaoCampo[] = [
  {
    chave: 'toxicologico_data',
    rotulo: 'Último exame toxicológico',
    tipo: 'data',
    ajuda: 'Obrigatório para as categorias C, D e E.',
  },
  { chave: 'toxicologico_validade', rotulo: 'Validade do toxicológico', tipo: 'data' },
  {
    chave: 'toxicologico_resultado',
    rotulo: 'Resultado',
    tipo: 'select',
    opcoes: RESULTADOS,
    colSpan: 2,
  },
  { chave: 'aso_data', rotulo: 'Data do ASO', tipo: 'data' },
  { chave: 'aso_validade', rotulo: 'Validade do ASO', tipo: 'data' },
]

const VINCULOS = (Object.keys(ROTULO_VINCULO) as VinculoMotorista[]).map((v) => ({
  valor: v,
  rotulo: ROTULO_VINCULO[v],
}))

export const CAMPOS_PROFISSIONAL: DefinicaoCampo[] = [
  { chave: 'data_admissao', rotulo: 'Data de admissão', tipo: 'data' },
  { chave: 'vinculo', rotulo: 'Tipo de vínculo', tipo: 'select', opcoes: VINCULOS },
  { chave: 'cargo', rotulo: 'Cargo', placeholder: 'Motorista de transporte escolar' },
  { chave: 'setor', rotulo: 'Setor ou filial', placeholder: 'Setor de Transporte' },
  { chave: 'matricula_interna', rotulo: 'Matrícula interna' },
  { chave: 'gestor_responsavel', rotulo: 'Gestor responsável' },
  {
    chave: 'observacoes',
    rotulo: 'Observações gerais',
    tipo: 'textarea',
    colSpan: 2,
    placeholder: 'Restrições, histórico, anotações do setor…',
  },
]

/** Quais campos de cada aba, para o indicador de pendência do Tabs. */
export const CAMPOS_POR_ABA: Partial<Record<AbaMotorista, DefinicaoCampo[]>> = {
  pessoais: [...CAMPOS_PESSOAIS, ...CAMPOS_ENDERECO],
  cnh: CAMPOS_CNH,
  exames: CAMPOS_EXAMES,
  profissional: CAMPOS_PROFISSIONAL,
}
