import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { rotaInicial, useAuth } from '../auth/AuthProvider'
import { IconeOnibus } from '../components/icons'
import heroLogin from '../assets/home-hero.jpg'
import { DOMINIO_LOGIN, mensagemErro, supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'

/** Público declarado no formulário. Não concede acesso: serve para orientar a
 *  interface e barrar quem escolheu a opção errada. Quem manda é o tipo gravado
 *  em public.perfil, respaldado pelas policies de RLS. */
type Publico = 'estudante' | 'servidor' | 'motorista'

const NOME_TIPO: Record<string, string> = {
  admin: 'servidor (administrador)',
  operador: 'servidor (operador)',
  motorista: 'motorista',
  estudante: 'estudante',
}

/** O tipo do perfil corresponde ao público escolhido?
 *  Motorista entra pelo acesso de servidor, que é como ele consta na prefeitura. */
function corresponde(publico: Publico, tipo: string): boolean {
  if (publico === 'servidor') return tipo === 'admin' || tipo === 'operador' || tipo === 'motorista'
  if (publico === 'motorista') return tipo === 'motorista'
  return tipo === 'estudante'
}

/**
 * O acesso de servidor é criado com login e senha (RF20), e o Supabase Auth
 * autentica por e-mail. Sem "@" no campo, traduzimos login → e-mail com a
 * função email_do_login(), liberada para o papel anon justamente por rodar
 * antes da autenticação.
 */
async function resolverEmail(identificador: string): Promise<string> {
  const valor = identificador.trim()
  if (valor.includes('@')) return valor

  const { data, error } = await supabase.rpc('email_do_login', { p_login: valor.toLowerCase() })
  if (error) throw error
  if (!data) throw new Error('Login não encontrado.')
  return data as string
}

export default function Login() {
  const { sessao, perfil, entrar, sair, carregando } = useAuth()
  const navegar = useNavigate()
  const local = useLocation() as { state?: { de?: string } }
  const toast = useToast()

  // ?publico= vem dos links divulgados em Configurações › Acessos. Só
  // pré-seleciona a interface — quem autoriza continua sendo a RLS.
  const [params] = useSearchParams()
  const publicoDaUrl = params.get('publico')
  const [publico, setPublico] = useState<Publico>(
    publicoDaUrl === 'servidor' || publicoDaUrl === 'motorista' ? publicoDaUrl : 'estudante',
  )
  /** Estudante entra por e-mail; servidor e motorista entram por login. */
  const usaLogin = publico !== 'estudante'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Já autenticado: vai para o painel do próprio perfil (RF21). Durante o envio a
  // sessão já existe mas o público ainda não foi conferido — por isso o !enviando,
  // que evita um redirecionamento antes da validação terminar.
  if (!carregando && !enviando && sessao && perfil) {
    return <Navigate to={local.state?.de ?? rotaInicial(perfil.tipo)} replace />
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const tipo = await entrar(await resolverEmail(email), senha)

      if (!tipo) {
        await sair()
        setErro('Sua conta não tem perfil configurado. Procure o Setor de Transporte.')
        return
      }

      if (!corresponde(publico, tipo)) {
        await sair()
        setErro(
          `Esta conta é de ${NOME_TIPO[tipo] ?? tipo}, e você escolheu entrar como ` +
            `${publico === 'estudante' ? 'estudante' : publico}. ` +
            'A senha está certa; use a outra opção de acesso.',
        )
        return
      }

      navegar(local.state?.de ?? rotaInicial(tipo), { replace: true })
    } catch (err) {
      const msg = mensagemErro(err)
      setErro(
        msg.includes('Invalid login credentials') || msg.includes('Login não encontrado')
          ? `${publico === 'servidor' ? 'Login' : 'E-mail'} ou senha incorretos.`
          : msg,
      )
    } finally {
      setEnviando(false)
    }
  }

  async function recuperarSenha() {
    if (!email.trim()) {
      toast.alerta('Informe seu login ou e-mail para receber o link de redefinição.')
      return
    }
    try {
      const destino = await resolverEmail(email)

      // Acesso criado sem e-mail real não tem caixa postal para receber o link.
      if (destino.endsWith(`@${DOMINIO_LOGIN}`)) {
        toast.alerta(
          'Este acesso foi criado sem e-mail. Peça ao administrador para redefinir sua senha.',
        )
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(destino, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) toast.erro(mensagemErro(error))
      else toast.sucesso('Link de redefinição enviado para o seu e-mail.')
    } catch (err) {
      toast.erro(mensagemErro(err))
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.7fr_1fr]">
      {/* Painel institucional */}
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <img
          src={heroLogin}
          alt="Estudante embarcando no transporte acadêmico"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Sobreposição: garante contraste do texto claro sobre a foto. */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/75 to-primary/35" />

        <div className="relative flex h-full flex-col justify-between p-11 text-primary-fg">
          <div className="flex items-center gap-2.5">
            <IconeOnibus size={30} />
            <span className="text-[15px] font-semibold tracking-[0.02em]">GTPORTE</span>
          </div>

          <div className="max-w-[520px]">
            <h1 className="mb-[18px] text-[40px] font-medium leading-[1.12] tracking-[-0.015em]">
              Gestão do transporte acadêmico
            </h1>
            <p className="text-[15px] leading-[1.55] opacity-85">
              Cadastro digital, validação de documentos, distribuição automática por horário de aulas
              e confirmação diária de presença, em um só lugar.
            </p>
          </div>

          <div className="font-mono text-[11px] tracking-[0.06em] opacity-60">
            © 2026 Prefeitura de Araçatuba · Núcleo de TI
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-bg p-8 lg:p-11">
        <form onSubmit={submeter} className="w-full max-w-[360px]">
          <div className="mb-2 flex items-center gap-2 lg:hidden">
            <span className="text-primary">
              <IconeOnibus size={24} />
            </span>
            <span className="text-[15px] font-semibold">GTPORTE</span>
          </div>

          <div className="eyebrow mb-2">Entrar</div>
          <h2
            className={`text-[26px] font-semibold tracking-[-0.01em] ${
              publico === 'estudante' ? 'mb-5' : 'mb-1.5'
            }`}
          >
            Acesse sua conta
          </h2>
          {publico === 'servidor' && (
            <p className="mb-5 text-[13.5px] text-muted">Acesso restrito ao Setor de Transporte.</p>
          )}
          {publico === 'motorista' && (
            <p className="mb-5 text-[13.5px] text-muted">Painel do motorista.</p>
          )}

          {/* O acesso de servidor é a exceção: fica indicado, não em destaque. */}
          {usaLogin && (
            <div className="mb-4 flex items-center justify-between rounded-btn border border-edge bg-panel px-3 py-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                {publico === 'motorista' ? 'Acesso do motorista' : 'Acesso de servidor'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPublico('estudante')
                  setErro(null)
                }}
                className="text-[12px] text-primary hover:text-primary-hover"
              >
                Sou estudante
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3.5">
            <label className="block">
              <span className="field-label">
                {usaLogin ? 'Login ou e-mail' : 'E-mail institucional'}
              </span>
              <input
                type={usaLogin ? 'text' : 'email'}
                required
                autoComplete={usaLogin ? 'username' : 'email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  usaLogin ? 'marina.rocha' : 'voce@aracatuba.sp.gov.br'
                }
                className="field"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium">Senha</span>
                <button
                  type="button"
                  onClick={recuperarSenha}
                  className="text-xs text-primary hover:text-primary-hover"
                >
                  Esqueci minha senha
                </button>
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="field"
              />
            </label>

            {erro && (
              <div className="rounded-btn border border-danger/30 bg-bg-danger px-3 py-2.5 text-[12.5px] text-danger">
                {erro}
              </div>
            )}

            <button type="submit" disabled={enviando} className="btn-primary mt-2 w-full py-3">
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>

            {publico === 'estudante' ? (
              <>
                <div className="mt-3 text-center text-[12.5px] text-muted">
                  Ainda não tem cadastro?{' '}
                  <Link to="/cadastro" className="font-medium text-primary hover:text-primary-hover">
                    Cadastre-se como estudante
                  </Link>
                </div>
                <div className="mt-5 border-t border-line pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setPublico('servidor')
                      setErro(null)
                    }}
                    className="text-[11.5px] text-soft hover:text-muted"
                  >
                    Acesso de servidor
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 text-center text-[12.5px] text-muted">
                {publico === 'motorista'
                  ? 'Seu acesso é criado pelo Setor de Transporte.'
                  : 'A conta de servidor é criada pelo Setor de Transporte.'}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
