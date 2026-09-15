---
name: security-audit
description: Avalia aspectos de segurança do sistema GTporte. Use esta skill sempre que precisar auditar, revisar ou validar a segurança do projeto, incluindo autenticação, autorização (RLS), validação de entrada, exposição de dados sensíveis, configuração do Supabase, proteção de rotas, gerenciamento de sessão, upload de arquivos e vulnerabilidades comuns (XSS, CSRF, injection). Também útil quando o usuário perguntar "meu projeto é seguro?", "quais vulnerabilidades existem?", "o que preciso corrigir para produção?" ou qualquer variação sobre segurança, pentest, hardening ou compliance.
---

# Security Audit — GTporte

Skill para auditoria de segurança do sistema GTporte (Gestão de Transporte Universitário).

## Quando usar

- O usuário pede uma análise de segurança do projeto
- O usuário pergunta sobre vulnerabilidades, riscos ou melhorias de segurança
- Antes de um deploy em produção, para checklist de segurança
- Para gerar relatórios de auditoria para entrega acadêmica ou compliance

## Arquitetura do projeto (contexto)

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime + RLS)
- **Apps PWA:** motorista-app/ e estudante-app/ (mesma stack, separados)
- **Autenticação:** supabase.auth (email/senha, signInWithPassword, signUp)
- **Autorização:** Row Level Security (RLS) com funções helper (meu_tipo(), eh_admin())
- **Perfis de acesso:** admin, motorista, estudante, operador
- **Storage:** bucket "documentos" para uploads de CNH, RG, comprovantes
- **Env vars:** VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

## Checklist de auditoria

Execute cada categoria na ordem. Para cada item, classifique como:
- ✅ **OK** — implementado corretamente
- ⚠️ **ATENÇÃO** — funciona mas pode melhorar
- ❌ **CRÍTICO** — vulnerabilidade que precisa ser corrigida
- ℹ️ **INFO** — observação sem risco imediato

---

### 1. AUTENTICAÇÃO

Arquivos a analisar:
- `src/auth/AuthProvider.tsx`
- `src/auth/RotaProtegida.tsx`
- `src/lib/validarSenha.ts`
- `src/pages/Login.tsx`
- `src/pages/Cadastro.tsx`
- `estudante-app/src/hooks/useAuth.ts`
- `motorista-app/src/hooks/useAuth.ts`

Verificar:
- [ ] Senha mínima de 8 caracteres com maiúscula, número e especial
- [ ] validarSenha.ts está sendo chamado nas telas de cadastro (Cadastro.tsx, Funcionarios.tsx)
- [ ] Não há senhas hardcoded no código-fonte
- [ ] signInWithPassword usa email normalizado (trim, lowercase)
- [ ] Sessão persistida com autoRefreshToken habilitado
- [ ] Logout limpa completamente a sessão (signOut + limpar estados)
- [ ] Proteção contra brute force (rate limit do Supabase Auth ou custom)
- [ ] Tokens JWT não são expostos em logs ou console.log
- [ ] O signUp não vaza informação sobre e-mails já cadastrados (mensagem genérica)

Comando para buscar problemas:
```bash
grep -rn "console.log.*token\|console.log.*session\|console.log.*password\|console.log.*senha" src/ estudante-app/src/ motorista-app/src/ --include="*.ts" --include="*.tsx"
grep -rn "password.*=.*['\"].\+['\"]" src/ --include="*.ts" --include="*.tsx"
```

---

### 2. AUTORIZAÇÃO (RLS)

Arquivos a analisar:
- `supabase/migrations/0002_rls.sql`
- `supabase/migrations/0003_funcoes.sql`
- Todas as migrations que criam policies

Verificar:
- [ ] Toda tabela tem RLS habilitado (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] Policies usam `auth.uid()` para filtrar dados por usuário
- [ ] Funções helper (meu_tipo, eh_admin) são SECURITY DEFINER com search_path fixo
- [ ] Estudante só vê seus próprios dados (RN09)
- [ ] Motorista só vê sua rota e passageiros (RN08)
- [ ] Só admin pode alterar rotas (RN06) e aprovar documentos (RN07)
- [ ] Não existem policies com `USING (true)` em tabelas sensíveis
- [ ] INSERT/UPDATE/DELETE têm policies específicas (não só SELECT)
- [ ] Funções RPC usam SECURITY INVOKER (não DEFINER) quando manipulam dados do usuário

Comando para verificar:
```bash
grep -n "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql | wc -l
grep -n "USING (true)" supabase/migrations/*.sql
grep -n "SECURITY DEFINER" supabase/migrations/*.sql
```

---

### 3. VALIDAÇÃO DE ENTRADA

Arquivos a analisar:
- Todos os formulários em `src/pages/`
- `src/lib/validarSenha.ts`
- `estudante-app/src/pages/CompletarCadastro.tsx`
- `motorista-app/src/pages/Viagem.tsx`

Verificar:
- [ ] CPF é validado (formato e dígitos verificadores) antes de enviar ao banco
- [ ] E-mail é validado (formato) antes de enviar ao banco
- [ ] Campos obrigatórios são verificados no frontend E no banco (NOT NULL)
- [ ] Inputs numéricos (latitude, longitude, capacidade) têm limites
- [ ] Texto livre (observações, justificativas) tem limite de tamanho
- [ ] Nenhum input é inserido diretamente em queries SQL (usar sempre .from().insert())
- [ ] Upload de arquivos valida tipo MIME e tamanho máximo
- [ ] Datas são validadas (formato ISO, não aceita datas impossíveis)

---

### 4. EXPOSIÇÃO DE DADOS SENSÍVEIS

Verificar:
- [ ] `.env` está no `.gitignore` (nunca commitado)
- [ ] Apenas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão no frontend
- [ ] SERVICE_ROLE_KEY nunca aparece no código frontend
- [ ] CPFs, telefones e e-mails não são logados no console
- [ ] Respostas de erro da API não expõem estrutura do banco
- [ ] Stack traces não são exibidos para o usuário final
- [ ] Bucket de documentos não é público (requer autenticação)
- [ ] URLs assinadas de documentos têm expiração curta

Comando para verificar:
```bash
grep -rn "service_role\|SERVICE_ROLE\|supabase_service" src/ --include="*.ts" --include="*.tsx"
grep -rn "console.log.*cpf\|console.log.*email\|console.log.*telefone" src/ --include="*.ts" --include="*.tsx"
git log --all --oneline -- .env .env.local 2>/dev/null
```

---

### 5. PROTEÇÃO DE ROTAS (FRONTEND)

Arquivos a analisar:
- `src/auth/RotaProtegida.tsx`
- `src/App.tsx` (roteamento principal)
- `estudante-app/src/App.tsx`
- `motorista-app/src/App.tsx`

Verificar:
- [ ] Todas as rotas autenticadas passam por RotaProtegida
- [ ] RotaProtegida verifica perfil.tipo (não apenas sessão)
- [ ] Admin não acessa painel do motorista e vice-versa
- [ ] Rota /admin ou /dashboard redireciona para login se não autenticado
- [ ] PWAs verificam perfil antes de renderizar o app principal
- [ ] Não é possível acessar rotas de admin manipulando a URL manualmente

---

### 6. UPLOAD DE ARQUIVOS

Arquivos a analisar:
- `estudante-app/src/hooks/useEstudante.ts` (enviar documentos)
- `motorista-app/src/hooks/useMotorista.ts` (upload docs motorista)
- Supabase Storage policies

Verificar:
- [ ] Uploads são feitos no bucket "documentos" com path isolado por usuário
- [ ] Tipo de arquivo é validado (aceitar apenas image/* e .pdf)
- [ ] Tamanho máximo é limitado (recomendado: 5MB)
- [ ] Nomes de arquivo são sanitizados (sem path traversal: ../ ou /)
- [ ] Bucket NÃO é público — requer autenticação para download
- [ ] Usuário só pode acessar seus próprios documentos via RLS no Storage
- [ ] Não há possibilidade de sobrescrever documento de outro usuário

---

### 7. GERENCIAMENTO DE SESSÃO

Verificar:
- [ ] Token JWT expira em tempo razoável (padrão Supabase: 1h com refresh)
- [ ] autoRefreshToken está habilitado
- [ ] Logout limpa localStorage/sessionStorage
- [ ] Múltiplas abas não causam conflito de sessão
- [ ] Sessão expirada redireciona para login (não mostra erro genérico)
- [ ] PWAs lidam com sessão offline corretamente (Workbox + NetworkFirst)

---

### 8. VULNERABILIDADES COMUNS (OWASP)

Verificar:
- [ ] **XSS**: Nenhum `dangerouslySetInnerHTML` sem sanitização
- [ ] **CSRF**: Supabase Auth usa tokens Bearer (não cookies), logo CSRF é mitigado
- [ ] **SQL Injection**: Supabase JS client usa parameterized queries por padrão
- [ ] **Broken Access Control**: RLS aplicado em todas as tabelas
- [ ] **Insecure Direct Object Reference (IDOR)**: IDs de registros não são previsíveis (UUIDs)
- [ ] **Sensitive Data Exposure**: HTTPS obrigatório (Vercel/Supabase forçam)
- [ ] **Security Misconfiguration**: Verificar se debug/dev tools estão desabilitados em produção

Comando para buscar XSS:
```bash
grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|document.write" src/ estudante-app/src/ motorista-app/src/ --include="*.ts" --include="*.tsx"
```

---

### 9. CONFIGURAÇÃO DO SUPABASE

Verificar:
- [ ] Confirmação de e-mail habilitada (ou desabilitada intencionalmente com justificativa)
- [ ] Rate limiting configurado no Auth
- [ ] Logs de auditoria habilitados
- [ ] Backups automáticos do banco configurados
- [ ] Políticas de Storage configuradas (não usar bucket público)
- [ ] Realtime habilitado apenas nas tabelas necessárias
- [ ] Functions/Triggers não usam SECURITY DEFINER desnecessariamente

---

### 10. PRODUÇÃO E DEPLOY

Verificar:
- [ ] Build de produção não contém source maps expostos
- [ ] Variáveis de ambiente são injetadas via plataforma (Vercel), não hardcoded
- [ ] CORS configurado corretamente no Supabase (apenas domínios permitidos)
- [ ] Headers de segurança (CSP, X-Frame-Options, HSTS) configurados
- [ ] Domínio customizado com certificado SSL válido
- [ ] Monitoramento de erros configurado (Sentry ou similar)

---

## Formato de saída

Ao executar esta skill, gere um relatório no seguinte formato:

```markdown
# Relatório de Auditoria de Segurança — GTporte
**Data:** DD/MM/AAAA
**Auditor:** [nome]
**Versão do código:** [commit hash]

## Resumo executivo
- X itens OK
- X itens com atenção
- X itens críticos

## Achados por categoria
### 1. Autenticação
| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| ...  | ✅/⚠️/❌ | ... | ... |

(repetir para cada categoria)

## Recomendações prioritárias
1. [CRÍTICO] ...
2. [ATENÇÃO] ...

## Conclusão
...
```

## Notas

- Esta skill analisa APENAS o código-fonte. Não faz pentest ativo.
- Para auditoria completa, complementar com testes manuais no Supabase Dashboard.
- A classificação de severidade segue: CRÍTICO > ATENÇÃO > INFO > OK.
- Atualize este checklist conforme novas funcionalidades forem adicionadas ao projeto.
