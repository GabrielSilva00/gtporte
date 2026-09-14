import { Bus, FileText, History, Home, MessageCircle, User } from 'lucide-react'

/**
 * Secoes do aplicativo.
 *
 * A navegacao acontece pelos cards da tela inicial e pelo menu lateral;
 * a barra inferior foi removida. Este modulo existe para o tipo e a
 * lista nao dependerem de nenhum componente de tela.
 */
export const SECOES = [
  { id: 'inicio', icon: Home, label: 'Início' },
  { id: 'rota', icon: Bus, label: 'Minha Rota' },
  { id: 'documentos', icon: FileText, label: 'Documentos' },
  { id: 'historico', icon: History, label: 'Histórico' },
  { id: 'feedback', icon: MessageCircle, label: 'Mensagens' },
  { id: 'perfil', icon: User, label: 'Perfil' },
] as const

export type Tab = (typeof SECOES)[number]['id']

export const TITULO_SECAO: Record<Tab, string> = {
  inicio: 'Início',
  rota: 'Minha Rota',
  documentos: 'Documentos',
  historico: 'Histórico',
  feedback: 'Mensagens',
  perfil: 'Perfil',
}
