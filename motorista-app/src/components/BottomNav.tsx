import { Bus, Bell, FileText, ScanLine, User } from 'lucide-react'

// Cinco abas e o limite confortavel numa tela de 360px; Historico e Mensagens
// ficam dentro do Perfil, que e onde o motorista vai fora da viagem.
const tabs=[
  {id:'viagem',icon:Bus,label:'Viagem'},
  {id:'checkin',icon:ScanLine,label:'Check-in'},
  {id:'avisos',icon:Bell,label:'Avisos'},
  {id:'documentos',icon:FileText,label:'Docs'},
  {id:'perfil',icon:User,label:'Perfil'},
] as const

export type Tab=typeof tabs[number]['id']

export function BottomNav({active,onChange}:{active:Tab;onChange:(t:Tab)=>void}){
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-navy-900/95 backdrop-blur-xl safe-b">
    <div className="mx-auto flex max-w-lg">
      {tabs.map(t=>{
        const sel=active===t.id
        return <button key={t.id} onClick={()=>onChange(t.id)} aria-current={sel?'page':undefined}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${sel?'text-gold-500':'text-white/40'}`}>
          <t.icon className="h-5 w-5" strokeWidth={sel?2.2:1.6}/>
          <span className="text-[10px] font-medium">{t.label}</span>
        </button>
      })}
    </div>
  </nav>
}
