import {
  IconeAlocacao,
  IconeDashboard,
  IconeDocumento,
  IconeEngrenagem,
  IconeEquipe,
  IconeEstudante,
  IconeMensagem,
  IconeMotorista,
  IconePresenca,
  IconeRelatorio,
  IconeRota,
  IconeSolicitacao,
  IconeUniversidade,
  IconeVeiculo,
} from '../components/icons'

export type ChavePagina =
  | 'dashboard'
  | 'alocacao'
  | 'presenca'
  | 'rotas'
  | 'estudantes'
  | 'veiculos'
  | 'motoristas'
  | 'universidades'
  | 'documentos'
  | 'relatorios'
  | 'funcionarios'
  | 'solicitacoes'
  | 'mensagens'
  | 'configuracoes'

export interface Pagina {
  chave: ChavePagina
  rotulo: string
  caminho: string
  categoria: string
  Icone: typeof IconeDashboard
  /** Páginas exclusivas de administrador nunca são liberadas para operadores. */
  somenteAdmin?: boolean
}

/**
 * Fonte única do menu, das rotas protegidas e da tela de permissões (RF20).
 * As chaves espelham paginas_do_sistema() em 0007_ajustes_ui.sql — mexer aqui
 * exige mexer lá também.
 */
export const PAGINAS: Pagina[] = [
  { chave: 'dashboard', rotulo: 'Visão geral', caminho: '/', categoria: 'Operação', Icone: IconeDashboard },
  { chave: 'alocacao', rotulo: 'Alocação', caminho: '/alocacao', categoria: 'Operação', Icone: IconeAlocacao },
  { chave: 'presenca', rotulo: 'Presença', caminho: '/presenca', categoria: 'Operação', Icone: IconePresenca },
  { chave: 'rotas', rotulo: 'Rotas', caminho: '/rotas', categoria: 'Operação', Icone: IconeRota },

  { chave: 'estudantes', rotulo: 'Estudantes', caminho: '/estudantes', categoria: 'Cadastros', Icone: IconeEstudante },
  { chave: 'veiculos', rotulo: 'Veículos', caminho: '/veiculos', categoria: 'Cadastros', Icone: IconeVeiculo },
  { chave: 'motoristas', rotulo: 'Motoristas', caminho: '/motoristas', categoria: 'Cadastros', Icone: IconeMotorista },
  { chave: 'universidades', rotulo: 'Universidades', caminho: '/universidades', categoria: 'Cadastros', Icone: IconeUniversidade },

  { chave: 'solicitacoes', rotulo: 'Solicitações', caminho: '/solicitacoes', categoria: 'Comunicação', Icone: IconeSolicitacao },
  { chave: 'mensagens', rotulo: 'Mensagens', caminho: '/mensagens', categoria: 'Comunicação', Icone: IconeMensagem },

  { chave: 'documentos', rotulo: 'Documentos', caminho: '/documentos', categoria: 'Administração', Icone: IconeDocumento },
  { chave: 'relatorios', rotulo: 'Relatórios', caminho: '/relatorios', categoria: 'Administração', Icone: IconeRelatorio },
  { chave: 'funcionarios', rotulo: 'Funcionários', caminho: '/funcionarios', categoria: 'Administração', Icone: IconeEquipe, somenteAdmin: true },
  { chave: 'configuracoes', rotulo: 'Configurações', caminho: '/configuracoes', categoria: 'Administração', Icone: IconeEngrenagem },
]

/** Ordem em que as categorias aparecem no menu. */
export const CATEGORIAS = [...new Set(PAGINAS.map((p) => p.categoria))]

/** Páginas que o administrador pode liberar para um operador. */
export const PAGINAS_CONCEDIVEIS = PAGINAS.filter((p) => !p.somenteAdmin)

export function paginaPorCaminho(caminho: string): Pagina | undefined {
  return PAGINAS.find((p) => p.caminho === caminho)
}
