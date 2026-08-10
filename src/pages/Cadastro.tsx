import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mensagemErro, supabase } from '../lib/supabase'
import { IconeCheck, IconeOnibus } from '../components/icons'

/**
 * RF01 — auto-cadastro público do estudante (primeira etapa: conta de acesso).
 * Os dados acadêmicos e os documentos são preenchidos logo após o primeiro
 * login, na tela "Completar cadastro" do painel do estudante.
 */
export default function Cadastro() {
  const navegar = useNavigate()

  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    senha: '',
    confirmacao: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarEmail, setConfirmarEmail] = useState(false)

  const senhaCurta = form.senha.length > 0 && form.senha.length < 8
  const senhasDiferentes = form.confirmacao.length > 0 && form.senha !== form.confirmacao
  const valido =
    form.nome.trim().length > 2 &&
    form.email.includes('@') &&
    form.senha.length >= 8 &&
    form.senha === form.confirmacao

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.senha,
        options: {
          data: {
            nome: form.nome.trim(),
            telefone: form.telefone.trim() || null,
            tipo: 'estudante',
          },
        },
      })
      if (error) throw error

      // Quando a confirmação de e-mail está ativa no Supabase, o signUp não
      // devolve sessão — o estudante precisa confirmar antes de entrar.
      if (data.session) navegar('/estudante/completar', { replace: true })
      else setConfirmarEmail(true)
    } catch (err) {
      const msg = mensagemErro(err)
      setErro(
        msg.includes('already registered')
          ? 'Já existe uma conta com este e-mail. Faça login.'
          : msg,
      )
    } finally {
      setEnviando(false)
    }
  }

  if (confirmarEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-success text-success">
            <IconeCheck size={22} />
          </div>
          <h1 className="mt-4 text-[19px] font-semibold">Confirme seu e-mail</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Enviamos um link de confirmação para <b>{form.email}</b>. Depois de confirmar, faça
            login para completar o cadastro acadêmico e enviar os documentos.
          </p>
          <Link to="/login" className="btn-primary mt-6 w-full">
            Ir para o login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-primary p-11 text-primary-fg lg:flex">
        <div className="flex items-center gap-2.5">
          <IconeOnibus size={30} />
          <span className="text-[15px] font-semibold tracking-[0.02em]">GTPORTE</span>
        </div>

        <div className="max-w-[440px]">
          <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] opacity-60">
            Transporte acadêmico · Araçatuba
          </div>
          <h1 className="mb-[18px] text-[34px] font-medium leading-[1.15] tracking-[-0.015em]">
            Solicite seu transporte sem sair de casa.
          </h1>
          <p className="text-[14.5px] leading-[1.55] opacity-75">
            Cadastro e documentos 100% digitais. Você é alocado automaticamente em um ônibus
            compatível com o horário das suas aulas.
          </p>
        </div>

        <div className="font-mono text-[11px] tracking-[0.06em] opacity-50">
          © 2026 Prefeitura de Araçatuba · Núcleo de TI
        </div>
      </div>

      <div className="flex items-center justify-center bg-bg p-8 lg:p-11">
        <form onSubmit={submeter} className="w-full max-w-[400px]">
          <div className="eyebrow mb-2">Cadastro de estudante</div>
          <h2 className="mb-1.5 text-[24px] font-semibold tracking-[-0.01em]">
            Solicitar transporte
          </h2>
          <p className="mb-5 text-[13.5px] text-muted">
            Etapa 1 de 2, crie sua conta de acesso.
          </p>

          <div className="mb-5 flex gap-2">
            <div className="h-[3px] flex-1 rounded-full bg-primary" />
            <div className="h-[3px] flex-1 rounded-full bg-edge" />
          </div>

          <div className="flex flex-col gap-3">
            <label>
              <span className="field-label">Nome completo</span>
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Como está no RG"
                className="field"
                required
              />
            </label>
            <label>
              <span className="field-label">E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="voce@email.com"
                className="field"
                required
              />
            </label>
            <label>
              <span className="field-label">Telefone</span>
              <input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(18) 9 0000-0000"
                className="field"
              />
            </label>
            <label>
              <span className="field-label">Senha</span>
              <input
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="field"
                required
              />
              {senhaCurta && (
                <span className="mt-1 block text-[11.5px] text-danger">
                  A senha precisa ter ao menos 8 caracteres.
                </span>
              )}
            </label>
            <label>
              <span className="field-label">Confirmar senha</span>
              <input
                type="password"
                value={form.confirmacao}
                onChange={(e) => setForm({ ...form, confirmacao: e.target.value })}
                placeholder="Repita a senha"
                className="field"
                required
              />
              {senhasDiferentes && (
                <span className="mt-1 block text-[11.5px] text-danger">
                  As senhas não coincidem.
                </span>
              )}
            </label>

            {erro && (
              <div className="rounded-btn border border-danger/30 bg-bg-danger px-3 py-2.5 text-[12.5px] text-danger">
                {erro}
              </div>
            )}

            <button type="submit" disabled={!valido || enviando} className="btn-primary mt-2 w-full py-3">
              {enviando ? 'Criando conta…' : 'Continuar →'}
            </button>

            <div className="mt-2 text-center text-[12.5px] text-muted">
              Já tem cadastro?{' '}
              <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
                Entrar
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
