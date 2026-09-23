// Edge Function: envia Web Push para os aparelhos do destinatario de cada
// notificacao nova.
//
// Ligacao: Supabase -> Database -> Webhooks -> "Create a new hook"
//   tabela public.notificacao, evento INSERT, tipo "Supabase Edge Function",
//   funcao enviar-push.
//
// Segredos (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:ti@prefeitura.sp.gov.br)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja existem no ambiente da funcao.
//
// Gerar o par VAPID uma vez: npx web-push generate-vapid-keys
// A chave publica tambem vai no app do estudante: VITE_VAPID_PUBLIC_KEY.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

interface Notificacao {
  id: string
  perfil_id: string
  titulo: string
  corpo: string
  destino: string | null
}

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@gtporte.local',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const corpo = await req.json().catch(() => null)
  const n = corpo?.record as Notificacao | undefined
  if (!n?.perfil_id) return new Response('sem registro', { status: 400 })

  const { data: inscricoes } = await admin
    .from('push_inscricao')
    .select('id,endpoint,p256dh,auth')
    .eq('perfil_id', n.perfil_id)

  const mensagem = JSON.stringify({ id: n.id, titulo: n.titulo, corpo: n.corpo, destino: n.destino })
  let enviados = 0

  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        mensagem,
      )
      enviados++
    } catch (e) {
      // 404/410: o aparelho cancelou a inscricao — remove para nao tentar de novo.
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_inscricao').delete().eq('id', i.id)
      }
    }
  }

  return Response.json({ enviados })
})
