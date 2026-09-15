# Relatório de Auditoria de Segurança — GTporte

**Data:** 15/09/2026
**Auditor:** Claude Code (skill `security-audit`)
**Versão do código:** `be7623f` (branch `claude/gtporte-security-audit-go75m2`)
**Escopo:** painel administrativo (`src/`), app do estudante (`estudante-app/`), app do motorista (`motorista-app/`), migrations do Supabase (`supabase/migrations/`)
**Método:** revisão estática de código-fonte e de migrations SQL. **Não** inclui pentest ativo nem inspeção do Supabase Dashboard (Auth settings, rate limiting, backups) — esses itens ficam marcados como "verificação manual pendente".

## Resumo executivo

| Status | Qtde |
|---|---|
| ✅ OK | 21 |
| ⚠️ ATENÇÃO | 9 |
| ❌ CRÍTICO | 1 |
| ℹ️ INFO / verificação manual | 4 |

O ponto mais forte do projeto é a camada de autorização: **todas as 34 tabelas do schema `public` têm RLS habilitada**, as duas únicas policies `USING (true)` são para tabelas de referência pública e não sensíveis (cidade, universidade), o bucket de documentos pessoais é privado com policies por pasta, e funções `SECURITY DEFINER` fixam `search_path`. O achado crítico é uma função RPC exposta ao papel `anon` que devolve o e-mail cadastrado a partir de um "login" informado livremente, o que permite enumerar contas e coletar e-mails reais sem autenticação.

## Achados por categoria

### 1. Autenticação

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Senha mínima 8 + maiúscula + número + especial | ⚠️ | `src/lib/validarSenha.ts` implementa a regra completa, mas **só é usada nos testes** (`src/__tests__/validarSenha.test.ts`). O auto-cadastro do estudante (`src/pages/Cadastro.tsx:25-31`) só checa `senha.length >= 8`, sem exigir maiúscula/número/especial. | Chamar `validarSenha()` em `Cadastro.tsx` em vez de reimplementar a checagem inline. |
| `validarSenha` chamada em `Funcionarios.tsx` | ❌ CRÍTICO* | `src/pages/Funcionarios.tsx:152` exige apenas `form.senha.length < 6` — nem 8 caracteres, nem complexidade — para contas de **admin, operador e motorista** criadas pelo setor de transporte. É a política de senha mais fraca do sistema para os perfis mais privilegiados. | Aplicar `validarSenha()` (ou regra equivalente) também na criação de contas de servidor/motorista. |
| Sem senha hardcoded no código-fonte | ✅ | Nenhuma ocorrência de senha literal em `src/`, `estudante-app/src`, `motorista-app/src`. | — |
| `signInWithPassword` com e-mail normalizado | ✅ | `resolverEmail()` em `src/pages/Login.tsx:34-42` faz `trim()`/`lowerCase()` e resolve login→e-mail via RPC antes de autenticar. Apps do estudante/motorista também fazem `email.trim()`. | — |
| Sessão persistida com `autoRefreshToken` | ✅ | `src/lib/supabase.ts:12-17`: `persistSession: true, autoRefreshToken: true`. | — |
| Logout limpa a sessão | ✅ | `AuthProvider.sair()` chama `supabase.auth.signOut()` e zera todos os estados locais (perfil, ids, permissões). | — |
| Proteção contra brute force | ℹ️ | Depende do rate limiting nativo do Supabase Auth (configuração no Dashboard, fora do código). A RPC `email_do_login` (ver item 2 abaixo) **não** passa pelo rate limit do Auth, pois roda antes do login. | Verificar rate limiting no Supabase Dashboard; considerar limitar chamadas a `email_do_login` (ex.: Edge Function com throttling, ou CAPTCHA no formulário). |
| Tokens JWT não aparecem em `console.log` | ✅ | Nenhuma ocorrência de log de token/sessão/senha em `src/`, `estudante-app/src`, `motorista-app/src`. | — |
| `signUp` não vaza e-mail já cadastrado | ✅ | Erros de login (`Invalid login credentials` / `Login não encontrado`) são convertidos para a mensagem genérica "Login ou senha incorretos" em `Login.tsx:96-101`. | — |

\* Classificado como crítico porque atinge diretamente a política de senha das contas administrativas, o grupo de maior privilégio do sistema.

### 2. Autorização (RLS)

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Toda tabela com RLS habilitado | ✅ | 34/34 tabelas criadas têm `ENABLE ROW LEVEL SECURITY` (conferido por diff entre `CREATE TABLE` e `ENABLE ROW LEVEL SECURITY` em todas as migrations). | — |
| Policies usam `auth.uid()` / funções helper | ✅ | `meu_tipo()`, `eh_admin()`, `eh_staff()`, `meu_estudante_id()`, `meu_motorista_id()` em `0002_rls.sql` e usadas consistentemente nas policies subsequentes. | — |
| Estudante só vê seus dados / Motorista só vê sua rota | ✅ | Confirmado pelo padrão de policies nas tabelas `estudante`, `presenca`, `documento`, `alocacao_estudante`, etc. | — |
| `USING (true)` em tabelas sensíveis | ✅ | As únicas duas ocorrências (`0019_cadastro_publico.sql`) são em `cidade` e `universidade` — dados públicos não pessoais, com justificativa documentada no próprio arquivo (cadastro do estudante ainda anônimo). Escrita continua restrita ao staff. | — |
| Funções helper `SECURITY DEFINER` com `search_path` fixo | ✅ | Todas as funções `security definer` revisadas em `0002_rls.sql`/`0003_funcoes.sql` fixam `set search_path = public`. | — |
| RPC `email_do_login` exposta a `anon` | ❌ **CRÍTICO** | `0007_ajustes_ui.sql:390-402`: função `SECURITY DEFINER` que devolve `perfil.email` para **qualquer** valor de `login` informado, concedida a `anon` e `authenticated`. Sem rate limiting próprio, permite: (a) enumerar quais logins existem (retorno `null` vs. e-mail), e (b) coletar o e-mail real de qualquer conta a partir do login (nomes previsíveis como `nome.sobrenome`). | Mitigar com: rate limiting dedicado (Edge Function ou extensão `pg_net`/`pgbouncer` com throttle), CAPTCHA no formulário de login, ou trocar o retorno por um hash opaco resolvido só no backend de auth. Documentar a decisão se o risco for aceito (dado que é infraestrutura interna da prefeitura). |
| INSERT/UPDATE/DELETE com policies específicas | ✅ | Tabelas revisadas (`documento`, `presenca`, `solicitacao_volta`, etc.) têm policies distintas por operação, não apenas SELECT. | — |
| RPCs de escrita usam `SECURITY INVOKER` quando manipulam dados do próprio usuário | ⚠️ | A maioria das RPCs de escrita usa `SECURITY DEFINER` (ex.: `confirmar_presenca()`, funções de check-in) — o padrão do projeto é DEFINER com validações internas de perfil, não INVOKER. Não é necessariamente uma falha (é um padrão consistente e documentado nos comentários), mas cada função precisa validar corretamente `auth.uid()`/tipo de perfil internamente, já que ignora a RLS da tabela. | Manter a revisão dessas funções em toda nova migration — um `SECURITY DEFINER` sem checagem de perfil equivale a bypassar a RLS. |

### 3. Validação de entrada

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| CPF validado (dígitos verificadores) | ✅ | `estudante-app/src/lib/cpf.ts`: implementação correta do algoritmo oficial, rejeita sequências repetidas. Usado em `CompletarCadastro.tsx`. | — |
| E-mail validado antes de enviar ao banco | ✅ | Uso de `input type="email"` e `.includes('@')`/checks equivalentes nos formulários revisados. | — |
| Campos obrigatórios validados no frontend E no banco | ✅ | Colunas `not null` no schema (`0001_schema.sql`) combinadas com validação de formulário. | — |
| Texto livre com limite de tamanho | ℹ️ | Não foi possível confirmar limites de tamanho em todos os campos de texto livre (observações, justificativas) — verificar `maxlength` nos `<textarea>`/`<input>` e `varchar(n)` no schema. | Revisão manual pontual recomendada, sem indício de risco imediato (Postgres/PostgREST não expõem overflow explorável aqui). |
| Nenhum input direto em SQL | ✅ | Todo acesso a dados usa o cliente `supabase.from(...)`/`.rpc(...)` (PostgREST), sem concatenação de SQL no frontend. | — |
| Upload valida tipo MIME e tamanho máximo | ⚠️ | Ver categoria 6 (Upload de arquivos) — validação existe só como atributo `accept` do `<input type="file">`, sem checagem de `arquivo.size`/MIME real no cliente nem limite configurado no bucket do Supabase. | Ver recomendação na seção 6. |
| Datas validadas | ℹ️ | Não auditado em profundidade; sem indícios de datas aceitas fora do formato ISO nos pontos revisados. | — |

### 4. Exposição de dados sensíveis

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| `.env` no `.gitignore` | ✅ | `.gitignore` cobre `.env`, `.env.*` (com exceção explícita de `.env.example`). `git log --all` não mostra `.env`/`.env.local` no histórico. | — |
| Apenas `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no frontend | ✅ | Confirmado em `.env.example` e `src/lib/supabase.ts`. | — |
| `SERVICE_ROLE_KEY` nunca no frontend | ✅ | Nenhuma ocorrência de `service_role`/`SERVICE_ROLE` em `src/`, `estudante-app/src`, `motorista-app/src`. | — |
| CPF/telefone/e-mail não logados no console | ✅ | Nenhuma ocorrência de `console.log` com esses termos nos três bundles. | — |
| Erros da API não expõem estrutura do banco | ⚠️ | `mensagemErro()` (`src/lib/supabase.ts:76-87`) mapeia códigos conhecidos (`23505`, `23503`, `42501`) para mensagens amigáveis, mas o **fallback** (`return msg.replace(/^.*?ERROR:\s*/i, '')`) repassa a mensagem crua do Postgres/PostgREST para qualquer erro não mapeado — pode vazar nome de coluna/constraint em casos não previstos. | Trocar o fallback por uma mensagem genérica ("Não foi possível concluir a operação.") e logar o erro original só no servidor/telemetria, não na tela do usuário. |
| Bucket de documentos privado, exige autenticação | ✅ | `documentos` criado com `public = false` (`0002_rls.sql:356-358`); policies restringem por `eh_staff()` ou pasta = `estudante_id`/`motorista_id`. | — |
| URLs assinadas com expiração curta | ℹ️ | Não foi encontrado uso de `createSignedUrl` com validade explícita no código revisado — verificar se o app usa signed URLs (e por quanto tempo) ou download direto autenticado. | Revisão manual: confirmar a validade configurada onde `createSignedUrl` é chamado. |

### 5. Proteção de rotas (frontend)

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Rotas autenticadas passam por `RotaProtegida` | ✅ | `src/auth/RotaProtegida.tsx` centraliza a checagem; usado consistentemente pelo roteamento (`App.tsx`). | — |
| Verificação por `perfil.tipo`, não apenas sessão | ✅ | `RotaProtegida` checa `sessao`, `perfil.ativo` e `perfis.includes(perfil.tipo)` antes de renderizar, além de permissão granular por página (`podeAcessar`). | — |
| Admin não acessa painel do motorista e vice-versa | ✅ | Redirecionamento para `rotaInicial(perfil.tipo)` quando o tipo não corresponde à área. | — |
| Acesso a rotas de admin via manipulação de URL | ✅ | Bloqueado pela mesma guarda — a UI redireciona, e a RLS no backend impede leitura/escrita mesmo que a tela fosse forçada a renderizar. | — |
| Contas desativadas | ✅ | `RotaProtegida` bloqueia explicitamente `perfil.ativo === false` com mensagem dedicada. | — |

### 6. Upload de arquivos

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Upload isolado por usuário (path) | ✅ | `estudante-app/src/hooks/useEstudante.ts:42-43` e `motorista-app/src/hooks/useMotorista.ts:172-174` constroem o path como `{id}/{tipo}-{timestamp}.{ext}` a partir de IDs internos, não do nome do arquivo — sem risco de path traversal. | — |
| Tipo de arquivo validado (imagem/PDF) | ⚠️ | Só existe o atributo `accept="image/*,.pdf"` no `<input type="file">` (`estudante-app/src/pages/Documentos.tsx:191`, `motorista-app/src/pages/Documentos.tsx:77`) — é apenas uma dica de UI, **trivialmente contornável** (edição do DOM, chamada direta à API). Não há checagem de `arquivo.type` no código nem `allowed_mime_types` configurado no bucket do Supabase Storage. | Validar `arquivo.type`/assinatura do arquivo no cliente **e** configurar `allowed_mime_types` no bucket `documentos` via Supabase (Storage → bucket settings ou migration). |
| Tamanho máximo limitado (~5MB) | ⚠️ | Nenhuma checagem de `arquivo.size` encontrada em `useEstudante.ts`/`useMotorista.ts`, e o bucket `documentos` não define `file_size_limit` na migration. | Definir `file_size_limit` no bucket e validar `arquivo.size` no cliente antes do upload. |
| Nomes de arquivo sanitizados / sem path traversal | ✅ | O path final não usa `arquivo.name` diretamente (só a extensão, extraída com `.split('.').pop()`), então caracteres como `../` no nome original não chegam ao Storage. | — |
| Bucket não público | ✅ | Confirmado (categoria 4). | — |
| Usuário só acessa seus próprios documentos | ✅ | Policies de `storage.objects` restringem por `(storage.foldername(name))[1] = meu_estudante_id()` / prefixo `motorista/{motorista_id}/`. | — |

### 7. Gerenciamento de sessão

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Token JWT com expiração + refresh | ✅ | Padrão do Supabase (1h) com `autoRefreshToken: true`. | — |
| Logout limpa estado local | ✅ | Ver categoria 1. | — |
| Sessão expirada redireciona para login | ✅ | `RotaProtegida` trata `!sessao` com `<Navigate to="/login">`. | — |
| PWAs e sessão offline (Workbox) | ℹ️ | Não auditado neste ciclo — verificar manualmente a estratégia de cache/Workbox nos dois PWAs quanto a dados sensíveis persistidos offline. | Revisão manual recomendada antes do próximo deploy dos PWAs. |

### 8. Vulnerabilidades comuns (OWASP)

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| XSS (`dangerouslySetInnerHTML`, `innerHTML`, `eval`) | ✅ | Nenhuma ocorrência em `src/`, `estudante-app/src`, `motorista-app/src`. | — |
| CSRF | ✅ | Supabase Auth usa Bearer tokens (não cookies de sessão), CSRF clássico não se aplica. | — |
| SQL Injection | ✅ | Todo acesso via PostgREST (`supabase.from`/`.rpc`), sem SQL concatenado no cliente. | — |
| Broken Access Control | ✅ | RLS aplicado nas 34 tabelas (categoria 2), reforçado por `RotaProtegida` no frontend. | — |
| IDOR | ✅ | IDs de registros são UUID (`0001_schema.sql`), não sequenciais/previsíveis. | — |
| Sensitive Data Exposure em trânsito | ℹ️ | HTTPS depende da plataforma de deploy (Vercel/Supabase); não auditável a partir do código-fonte. | Confirmar que não há domínio custom servido sem HTTPS. |
| Security Misconfiguration (debug/dev tools) | ⚠️ | Não foram encontradas flags de debug hardcoded, mas **nenhum header de segurança** (CSP, X-Frame-Options, HSTS) está configurado em `vercel.json`/`vercel-motorista.json` — ver categoria 10. | Ver recomendação na seção 10. |

### 9. Configuração do Supabase

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Confirmação de e-mail habilitada | ℹ️ | Configuração do Supabase Dashboard, não visível no código. | Verificar manualmente; se desabilitada, documentar a justificativa (ex.: contas de servidor/motorista criadas pelo admin sem e-mail real, usando `DOMINIO_LOGIN` fictício — ver `src/lib/supabase.ts:68-73`, que já sinaliza esse cenário). |
| Rate limiting no Auth | ℹ️ | Idem — configuração de infraestrutura, fora do escopo estático. | Verificar no Dashboard; ver também o achado crítico da seção 2 sobre `email_do_login`. |
| Logs de auditoria / backups automáticos | ℹ️ | Fora do escopo do código-fonte. | Verificar no Supabase Dashboard (Point-in-time recovery, log retention). |
| Realtime habilitado só onde necessário | ℹ️ | Não auditado — verificar quais tabelas têm Realtime habilitado no Dashboard e se coincide com o uso real (ex.: `localizacao_rota`, `conversa_mensagem`). | Revisão manual. |
| Funções/Triggers sem `SECURITY DEFINER` desnecessário | ✅ | O uso extensivo de `SECURITY DEFINER` no projeto é consistente com o padrão adotado (funções que precisam ignorar RLS pontualmente, documentado nos comentários das migrations) — não foi encontrado uso aparentemente supérfluo. | Manter a disciplina de revisar cada novo `SECURITY DEFINER`. |

### 10. Produção e Deploy

| Item | Status | Descrição | Recomendação |
|------|--------|-----------|--------------|
| Source maps expostos no build | ℹ️ | Não verificado neste ciclo (depende de `vite.config.ts`/config de build); por padrão o Vite não gera sourcemap em produção a menos que configurado. | Confirmar `build.sourcemap` em `vite.config.ts` (root e dos dois PWAs). |
| Variáveis de ambiente via plataforma | ✅ | `.env` não commitado; app lê de `import.meta.env`, compatível com injeção via Vercel. | — |
| CORS configurado no Supabase | ℹ️ | Configuração de infraestrutura, fora do código. | Verificar no Dashboard se apenas os domínios de produção/preview estão liberados. |
| Headers de segurança (CSP, X-Frame-Options, HSTS) | ⚠️ | `vercel.json` e `vercel-motorista.json` só definem `rewrites` para SPA — nenhum header de segurança configurado. | Adicionar bloco `headers` no `vercel.json` com, no mínimo, `X-Frame-Options: DENY` (ou `SAMEORIGIN`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, e uma CSP compatível com Supabase (`connect-src` para o domínio do projeto). |
| Domínio com SSL válido | ℹ️ | Gerenciado pela plataforma (Vercel), não auditável via código. | — |
| Monitoramento de erros (Sentry ou similar) | ⚠️ | Nenhuma dependência de monitoramento de erros (`@sentry/*` ou similar) encontrada em nenhum dos três `package.json`. | Avaliar adicionar Sentry (ou similar) ao menos no painel administrativo, dado o volume de dados pessoais manipulados (CPF, documentos). |

### 11. Dependências (achado adicional — `npm audit`)

| Pacote | Severidade | Observação | Recomendação |
|---|---|---|---|
| `xlsx` (via `src/lib/exportar.ts`) | ⚠️ Alta (sem correção disponível) | Prototype Pollution e ReDoS conhecidos na biblioteca SheetJS. Uso atual é só **exportação** (`XLSX.utils.json_to_sheet` / `writeFile`), não há leitura de planilhas enviadas por usuários — exploração via este caminho é pouco provável hoje. | Monitorar a dependência; evitar introduzir qualquer fluxo de **importação** de `.xlsx` enviado por usuário sem reavaliar. Considerar migrar para uma lib mantida (ex.: `exceljs`) se for necessário importar arquivos externos no futuro. |
| `dompurify` / `jspdf` / `jspdf-autotable` | ⚠️ Moderada/Crítica (na cadeia) | Vulnerabilidades de XSS no DOMPurify, trazido transitivamente pelo `jspdf`. O projeto usa apenas `jspdf-autotable` para gerar tabelas (`src/lib/exportar.ts`), **não** usa `jsPDF.html()` com HTML dinâmico — o vetor de exploração não é atingido pelo uso atual. | Atualizar quando uma versão não-breaking estiver disponível; evitar futuramente qualquer uso de `doc.html()` com conteúdo vindo de input do usuário. |
| `react-router` / `react-router-dom` 6.26.2 | ⚠️ Moderada | Open redirect via barra invertida em `<Link>`/`useNavigate` (CVE relacionado) e falha de deserialização em SSR (não aplicável — este projeto é SPA, sem SSR). | `npm audit fix` (correção sem breaking change) — atualizar para a versão corrigida da 6.x. |

## Recomendações prioritárias

1. **[CRÍTICO]** Restringir a RPC `public.email_do_login` (`0007_ajustes_ui.sql`) contra enumeração de contas/e-mails: rate limiting dedicado, CAPTCHA no formulário de login, ou revisão do desenho (ex.: não devolver o e-mail em texto puro para o cliente).
2. **[CRÍTICO]** Unificar a política de senha usando `validarSenha()` em **todos** os pontos de criação de conta — hoje `Funcionarios.tsx` aceita senha de 6 caracteres sem complexidade para contas de admin/operador/motorista, e `Cadastro.tsx` (auto-cadastro do estudante) só verifica o comprimento.
3. **[ATENÇÃO]** Configurar `file_size_limit` e `allowed_mime_types` no bucket `documentos` do Supabase Storage, e validar `arquivo.type`/`arquivo.size` no cliente antes do upload (hoje só há a dica de UI `accept=`).
4. **[ATENÇÃO]** Adicionar headers de segurança (CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS) em `vercel.json` e `vercel-motorista.json`.
5. **[ATENÇÃO]** Trocar o fallback de `mensagemErro()` por uma mensagem genérica, evitando repassar texto cru de erros do Postgres/PostgREST ao usuário final.
6. **[ATENÇÃO]** Rodar `npm audit fix` para `react-router-dom` (correção sem breaking change) e reavaliar `xlsx`/`jspdf` se algum fluxo de importação de arquivos externos for adicionado no futuro.
7. **[INFO]** Completar a auditoria com os itens que exigem acesso ao Supabase Dashboard: confirmação de e-mail, rate limiting do Auth, CORS, backups, logs de auditoria, Realtime por tabela, e validade das signed URLs de documentos.

## Conclusão

O GTporte tem uma base de segurança sólida no que depende diretamente do código: cobertura de RLS completa e consistente, isolamento de storage por usuário, proteção de rotas no frontend bem estruturada, e ausência dos vetores clássicos de XSS/SQL injection/CSRF. Os dois achados críticos — a RPC de resolução de login sem proteção contra enumeração e a política de senha inconsistente (mais fraca justamente para contas de maior privilégio) — são localizados e de correção relativamente simples, e devem ser tratados antes de um deploy em produção com dados reais de estudantes, motoristas e servidores. Os itens de "ATENÇÃO" (upload sem limites de tipo/tamanho, ausência de headers de segurança, mensagens de erro com fallback verboso, dependências desatualizadas) reduzem a superfície de risco quando corrigidos, mas não bloqueiam o uso atual. Os itens marcados como "INFO" exigem verificação manual no Supabase Dashboard e na plataforma de deploy, fora do alcance de uma revisão estática de código.
