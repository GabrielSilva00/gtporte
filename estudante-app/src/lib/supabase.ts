import { createClient } from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL||'';const key=import.meta.env.VITE_SUPABASE_ANON_KEY||''
export const supabase=createClient(url||'http://localhost:54321',key||'anon',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
export function erroMsg(e:unknown){if(!e)return'Erro desconhecido';const err=e as{message?:string;code?:string};const msg=err.message??String(e);if(err.code==='42501'||msg.includes('row-level security'))return'Sem permissão.';return msg.replace(/^.*?ERROR:\s*/i,'')}
