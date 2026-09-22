import { erroMsg, supabase } from '@/lib/supabase'

/**
 * Notificacoes no aparelho.
 *
 * Duas camadas:
 *  1. Com o app aberto (ou em segundo plano no navegador), cada linha nova
 *     de `notificacao` chega pelo Realtime e vira uma notificacao do
 *     sistema aqui mesmo — mostrarNoAparelho().
 *  2. Com o app fechado, quem entrega e o Web Push: o aparelho se inscreve
 *     (ativarPush) e a Edge Function `enviar-push` manda a notificacao
 *     quando o banco grava uma linha nova. Exige a chave publica VAPID em
 *     VITE_VAPID_PUBLIC_KEY; sem ela, so a camada 1 funciona.
 */

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function suportaNotificacao() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pushConfigurado() {
  return !!VAPID && suportaNotificacao() && 'serviceWorker' in navigator && 'PushManager' in window
}

export function permissaoNotificacao(): NotificationPermission | 'indisponivel' {
  return suportaNotificacao() ? Notification.permission : 'indisponivel'
}

/** Mostra uma notificacao do sistema se o usuario permitiu e o app nao esta em primeiro plano. */
export async function mostrarNoAparelho(titulo: string, corpo: string) {
  if (!suportaNotificacao() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(titulo, { body: corpo, icon: '/icon-192.png', tag: titulo })
    else new Notification(titulo, { body: corpo })
  } catch {
    /* sem suporte: o sino continua mostrando */
  }
}

function chaveVapid(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Pede permissao e, havendo VAPID, inscreve o aparelho para receber push com o app fechado. */
export async function ativarPush(): Promise<'ativado' | 'so-app-aberto' | 'negado'> {
  if (!suportaNotificacao()) throw new Error('Este aparelho não oferece notificações.')
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return 'negado'
  if (!pushConfigurado()) return 'so-app-aberto'

  const reg = await navigator.serviceWorker.ready
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveVapid(VAPID!),
    }))
  const json = inscricao.toJSON()
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: inscricao.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  })
  if (error) throw new Error(erroMsg(error))
  return 'ativado'
}
