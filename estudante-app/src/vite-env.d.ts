/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Chave publica VAPID do Web Push. Opcional. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}
