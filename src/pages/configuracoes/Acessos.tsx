import { useState } from 'react'
import { useToast } from '../../components/ui/Toast'
import { IconeCheck, IconeInfo, IconeChave } from '../../components/icons'

interface LinkAcesso {
  chave: string
  titulo: string
  descricao: string
  caminho: string
  comoUsar: string
}

/**
 * Links diretos para os portais de estudante e motorista.
 *
 * São URLs públicas com o público já pré-selecionado no login — não
 * carregam token nem concedem acesso por si só: quem abre ainda precisa
 * de credencial. Servem para divulgação (cartaz, e-mail, grupo dos
 * responsáveis) sem obrigar a explicar onde clicar na tela de entrada.
 */
const LINKS: LinkAcesso[] = [
  {
    chave: 'estudante',
    titulo: 'Portal do estudante',
    descricao: 'Rota atribuída, confirmação de presença, documentos e mensagens.',
    caminho: '/login?publico=estudante',
    comoUsar:
      'Divulgue junto às instituições de ensino. Quem ainda não tem cadastro consegue se cadastrar pela própria tela.',
  },
  {
    chave: 'motorista',
    titulo: 'Portal do motorista',
    descricao: 'Manifesto de passageiros, solicitações de volta, avisos e documentos.',
    caminho: '/login?publico=motorista',
    comoUsar:
      'Entregue ao motorista junto com o login criado em Funcionários. O acesso só funciona depois que o cadastro estiver vinculado ao usuário.',
  },
  {
    chave: 'cadastro',
    titulo: 'Cadastro de novo estudante',
    descricao: 'Formulário público de solicitação de transporte.',
    caminho: '/cadastro',
    comoUsar:
      'Use no período de inscrições. O estudante cria a conta, completa o cadastro e envia os documentos para análise.',
  },
]

export default function Acessos() {
  const toast = useToast()
  const [copiado, setCopiado] = useState<string | null>(null)

  // Em SSR ou em teste, `location` pode não existir — daí o fallback.
  const origem = typeof window !== 'undefined' ? window.location.origin : ''

  async function copiar(link: LinkAcesso) {
    const url = `${origem}${link.caminho}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(link.chave)
      toast.sucesso('Link copiado.')
      setTimeout(() => setCopiado((c) => (c === link.chave ? null : c)), 2500)
    } catch {
      // clipboard exige contexto seguro (https ou localhost)
      toast.alerta('Não foi possível copiar. Selecione o endereço e copie manualmente.')
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-3.5">
        {LINKS.map((link) => {
          const url = `${origem}${link.caminho}`
          return (
            <div key={link.chave} className="card p-5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-primary">
                  <IconeChave size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold">{link.titulo}</div>
                  <p className="mt-0.5 text-[12.5px] text-muted">{link.descricao}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="field min-w-[240px] flex-1 font-mono text-[12px]"
                    />
                    <button onClick={() => copiar(link)} className="btn-ghost whitespace-nowrap">
                      {copiado === link.chave ? (
                        <>
                          <IconeCheck size={13} />
                          Copiado
                        </>
                      ) : (
                        'Copiar link'
                      )}
                    </button>
                    <a
                      href={link.caminho}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost whitespace-nowrap"
                    >
                      Abrir
                    </a>
                  </div>

                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                    {link.comoUsar}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-card bg-tint px-4 py-3.5 text-[12px] leading-relaxed text-muted">
        <span className="mt-px shrink-0 text-primary">
          <IconeInfo size={15} />
        </span>
        <span>
          Estes endereços apenas abrem a tela de entrada já no público certo — não substituem o
          login nem liberam acesso sozinhos. Podem ser divulgados livremente; quem abrir sem
          credencial não enxerga nenhum dado.
        </span>
      </div>
    </div>
  )
}
