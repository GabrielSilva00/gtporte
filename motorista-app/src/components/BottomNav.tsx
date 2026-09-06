import { Bus, Bell, MessageCircle, User } from 'lucide-react'
const tabs=[{id:'viagem',icon:Bus,label:'Viagem'},{id:'avisos',icon:Bell,label:'Avisos'},{id:'mensagens',icon:MessageCircle,label:'Mensagens'},{id:'perfil',icon:User,label:'Perfil'}] as const
export type Tab=typeof tabs[number]['id']
export function BottomNav({active,onChange,unread}:{active:Tab;onChange:(t:Tab)=>void;unread?:number}){
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-navy-900/95 backdrop-blur-xl safe-b"><div className="mx-auto flex max-w-lg">
    {tabs.map(t=>{const sel=active===t.id;return <button key={t.id} onClick={()=>onChange(t.id)} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${sel?'text-gold-500':'text-white/40'}`}><t.icon className="h-5 w-5" strokeWidth={sel?2.2:1.6}/><span className="text-[10px] font-medium">{t.label}</span>
    {t.id==='mensagens'&&!!unread&&unread>0&&<span className="absolute right-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unread>9?'9+':unread}</span>}</button>})}
  </div></nav>}
