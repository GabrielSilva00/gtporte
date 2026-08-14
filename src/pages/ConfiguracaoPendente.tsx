import { IconeInfo, IconeOnibus } from '../components/icons'

/** Exibida quando o .env ainda não foi preenchido — evita tela branca. */
export default function Configuracao() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-2xl p-8">
        <div className="flex items-center gap-2.5 text-primary">
          <IconeOnibus size={26} />
          <span className="text-[15px] font-semibold">GTPORTE</span>
        </div>

        <h1 className="mt-5 text-[20px] font-semibold">Configuração pendente</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          As credenciais do Supabase ainda não foram informadas. Crie um arquivo{' '}
          <code className="rounded bg-tint px-1 py-0.5 font-mono text-[12.5px]">.env</code> na raiz
          do projeto (copiando <code className="font-mono text-[12.5px]">.env.example</code>) com:
        </p>

        <pre className="mt-4 overflow-x-auto rounded-btn bg-tint p-4 font-mono text-[12px] leading-relaxed">
{`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
        </pre>

        <p className="mt-3 text-[12.5px] text-muted">
          Os valores estão em <b>Project Settings → API</b> no painel do Supabase. Reinicie o{' '}
          <code className="font-mono">npm run dev</code> depois de salvar o arquivo.
        </p>

        <div className="mt-5 flex items-start gap-2.5 rounded-btn bg-tint px-3.5 py-3 text-[12px] text-muted">
          <span className="mt-px shrink-0 text-primary">
            <IconeInfo size={15} />
          </span>
          <div>
            Antes de acessar, execute as quatro migrations de{' '}
            <code className="font-mono">supabase/migrations/</code> no SQL Editor e crie um usuário
            administrador. O passo a passo completo está no <b>README.md</b>.
          </div>
        </div>
      </div>
    </div>
  )
}
