# GTPorte: o que falta para produção

Situação em 25/09/2026, depois das mudanças no app do motorista. Os três sistemas são PWAs
(painel administrativo, app do estudante e app do motorista) publicados na Vercel e usam o mesmo
projeto Supabase.

## 1. Bloqueia a publicação

| # | O que fazer | Onde |
|---|---|---|
| 1 | Aplicar a migration `0028_app_motorista.sql` no banco de produção **antes** de publicar o app do motorista. Depois, rodar `supabase/testes/fluxo_motorista.sql` no SQL Editor: ele desfaz tudo no fim e deve imprimir `OK 1` a `OK 4`. | Supabase → SQL Editor |
| 2 | Fechar os itens críticos da auditoria de segurança (`docs/auditoria-seguranca-2026-09-15.md`), que continuam abertos: `email_do_login()` liberada para `anon` permite descobrir quais logins existem; o cadastro de funcionários aceita senha de 6 caracteres e não usa `src/lib/validarSenha.ts`. | `0007_ajustes_ui.sql`, `src/pages/Funcionarios.tsx` |
| 3 | Limitar tipo e tamanho dos uploads nos buckets (`allowed_mime_types`, `file_size_limit`). Hoje qualquer arquivo de qualquer tamanho é aceito. | Supabase → Storage |
| 4 | Não rodar a pasta `migrations/` inteira num banco novo sem corrigir `0004_seed.sql`: ela usa a coluna `estudante.ra`, que não existe mais, e falha. Também não levar para produção `seed_estudante_teste.sql`, `conserta_login_teste.sql` nem as contas de teste. | `supabase/` |
| 5 | Três projetos na Vercel, cada um com o próprio *Root Directory* (raiz, `estudante-app/`, `motorista-app/`) e as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O PWA só instala e só usa GPS e câmera em HTTPS. O `motorista-app/vercel.json` foi criado agora para o service worker nunca ficar em cache e o app atualizar nos celulares. | Vercel |
| 6 | Supabase Auth: *Site URL* e *Redirect URLs* com os domínios finais; SMTP próprio (o de teste do Supabase limita a poucos e-mails por hora); desligar o cadastro público se não for usado. | Supabase → Authentication |
| 7 | Backup: plano com backup diário ou PITR. No plano gratuito não há backup automático, e o projeto é pausado após 7 dias sem uso. | Supabase → Billing |

## 2. Necessário para as notificações com o app fechado

Com o app aberto, as notificações já funcionam (Realtime). Com o app fechado, falta:

1. Gerar o par VAPID uma vez: `npx web-push generate-vapid-keys`.
2. `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...`
3. `supabase functions deploy enviar-push`.
4. Criar o Database Webhook: tabela `notificacao`, evento INSERT, Edge Function `enviar-push`.
5. `VITE_VAPID_PUBLIC_KEY` (a chave pública) nos projetos Vercel do estudante **e** do motorista.

No iPhone, o push só chega com o app instalado na tela inicial (iOS 16.4 ou mais novo).

## 3. Limitações de um PWA, que precisam ser combinadas com os motoristas

- **GPS só com o app aberto e a tela ligada.** Um app web não roda em segundo plano. Enquanto o
  rastreamento está ligado, o app agora pede para a tela não apagar (Wake Lock), mas se o
  motorista trocar de app ou bloquear o celular, as posições param até ele voltar. A situação
  automática (Aguardando/Em rota) depende do GPS, então vale o mesmo. Para rastrear com a tela
  apagada seria preciso um app nativo (por exemplo, empacotar com Capacitor).
- **Sem internet:** check-in, desfazer embarque e troca de situação ficam guardados no aparelho e
  são enviados quando a rede volta. As posições de GPS sem rede são descartadas de propósito:
  enviadas atrasadas, disparariam o aviso de "ônibus chegando" fora de hora.
- **Primeiro acesso precisa de internet.** O login e a primeira carga das listas exigem rede.
  Depois disso, o app abre sem internet com os dados do dia salvos no aparelho.

## 4. Antes de liberar para todos (primeiras semanas)

- **Teste de campo** com um Android (Chrome) e um iPhone (Safari): instalar o app, fazer uma
  viagem real com GPS, fazer check-in em modo avião e conferir o envio quando a rede voltar.
- **LGPD:** política de privacidade nos três apps (há dados de localização, CPF e documentos),
  aviso claro de uso da localização e prazo de retenção. A tabela `localizacao_rota` recebe uma
  posição a cada 15 s por ônibus, cerca de 240 por hora de viagem. Vale um job de limpeza (ex.:
  `pg_cron` apagando o que tiver mais de 90 dias).
- **Cabeçalhos de segurança** na Vercel (X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy com `geolocation=(self)` e `camera=(self)`) e, depois de testar, uma CSP.
- **Dependências do painel:** `npm audit` na raiz aponta 1 falha crítica e 2 altas (`xlsx` não tem
  correção publicada no npm). Os apps do estudante e do motorista estão limpos.
- **Monitoramento de erros** (Sentry ou similar) nos três apps, para saber de uma falha antes do
  motorista reclamar.
- **Mensagens de erro:** o app ainda mostra, em alguns casos, o texto cru do banco. Revisar
  `erroMsg` nos três projetos.

## 5. Arrumações depois da mudança dos avisos

- A aba **Avisos** saiu do app do motorista: o recado para todos os alunos agora vai no grupo da
  rota, que já notifica cada aluno. A tela "Avisos do motorista" em *Minha Rota* (app do
  estudante) e a página `/motorista/avisos` do painel ainda leem `aviso_rota` e podem ser
  removidas quando os avisos antigos deixarem de interessar.
