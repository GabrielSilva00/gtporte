import { Bus, FileText, History, MessageCircle, User } from 'lucide-react'
const tabs=[{id:'rota',icon:Bus,label:'Minha Rota'},{id:'documentos',icon:FileText,label:'Docs'},{id:'historico',icon:History,label:'Historico'},{id:'feedback',icon:MessageCircle,label:'Mensagens'},{id:'perfil',icon:User,label:'Perfil'}] as const
export type Tab=typeof tabs[number]['id']
export function BottomNav({active,onChange}:{active:Tab;onChange:(t:Tab)=>void}){
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-navy-900/95 backdrop-blur-xl safe-b"><div className="mx-auto flex max-w-lg">
    {tabs.map(t=>{const sel=active===t.id;return <button key={t.id} onClick={()=>onChange(t.id)} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${sel?'text-brand-500':'text-white/40'}`}><t.icon className="h-5 w-5" strokeWidth={sel?2.2:1.6}/><span className="text-[10px] font-medium">{t.label}</span></button>})}
  </div></nav>}
