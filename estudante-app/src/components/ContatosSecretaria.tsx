import { Clock, Globe, Headphones, Mail, MessageSquare, Phone, ShieldQuestion, User } from 'lucide-react'
import { useOrganizacao } from '@/hooks/useOrganizacao'
import { Spinner } from '@/components/Spinner'

/** Numero brasileiro -> link de WhatsApp (so digitos, com DDI 55). */
function linkWhats(numero: string) {
  const digitos = numero.replace(/\D/g, '')
  return `https://wa.me/${digitos.startsWith('55') ? digitos : `55${digitos}`}`
}

type Linha = { Icone: typeof Phone; rotulo: string; valor: string; href?: string }

export function ContatosSecretaria() {
  const { org, loading } = useOrganizacao()

  if (loading) return <div className="flex justify-center py-6"><Spinner /></div>
  if (!org) return null

  const linhas: Linha[] = []
  const add = (Icone: Linha['Icone'], rotulo: string, valor: string | null, href?: (v: string) => string) => {
    if (valor && valor.trim()) linhas.push({ Icone, rotulo, valor, href: href?.(valor) })
  }

  add(Phone, 'Telefone', org.telefone, (v) => `tel:${v.replace(/\s/g, '')}`)
  add(MessageSquare, 'WhatsApp', org.canal_whatsapp, linkWhats)
  add(Mail, 'E-mail', org.canal_email || org.email, (v) => `mailto:${v}`)
  add(Headphones, 'SAC', org.canal_sac)
  add(ShieldQuestion, 'Ouvidoria', org.canal_ouvidoria)
  add(Globe, 'Site', org.site, (v) => (v.startsWith('http') ? v : `https://${v}`))
  add(Clock, 'Atendimento', org.horario_atendimento)
  add(User, 'Responsável', org.gestor_nome)

  if (linhas.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold">Contato da secretaria</h3>
        <p className="mt-1 text-xs text-muted">
          A secretaria ainda não cadastrou os canais de atendimento.
        </p>
      </div>
    )
  }

  return (
    <div className="card space-y-1">
      <h3 className="text-sm font-semibold">Contato da secretaria</h3>
      <p className="pb-2 text-xs text-muted">
        {org.nome_fantasia || org.razao_social || 'Setor de transporte'}
      </p>
      <div className="divide-y divide-line/50">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-center gap-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
              <l.Icone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted">{l.rotulo}</p>
              {l.href ? (
                <a href={l.href} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-brand-500 underline underline-offset-2">
                  {l.valor}
                </a>
              ) : (
                <p className="truncate text-sm font-medium">{l.valor}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
