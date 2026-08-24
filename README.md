# GTPORTE

Sistema de gestão do transporte acadêmico municipal de Araçatuba/SP.
Implementação do relatório técnico **RT-TDS-2026-008 v0.3**, com os três perfis previstos:
**administrador**, **estudante** e **motorista**.

| | |
|---|---|
| **Front-end** | React 18 + Vite + TypeScript + Tailwind CSS |
| **Back-end** | Supabase (PostgreSQL + Auth + Storage + RLS) |
| **Regras de negócio** | Funções PL/pgSQL e Row Level Security no Postgres |
| **Design** | Portado de `_prototipo/GTPORTE.dc.html` |

> **Decisão de arquitetura.** A doc §6.2 previa Django REST + SQLite. O projeto roda sobre
> Supabase, que substitui tanto o container *Backend/API* quanto o banco SQLite. As regras que
> ficariam nos *services* Django foram implementadas como RLS policies e funções PL/pgSQL —
> registre isso no capítulo 8 do relatório (decisões técnicas).

---

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e execute, **nesta ordem**, o conteúdo de:

   | Arquivo | O que faz |
   |---|---|
   | `supabase/migrations/0001_schema.sql` | 15 tabelas, enums, índices, sincronização `auth.users` → `perfil` |
   | `supabase/migrations/0002_rls.sql` | RLS por perfil, bucket `documentos` e policies do Storage |
   | `supabase/migrations/0003_funcoes.sql` | Motor de distribuição, validação documental, triggers de log, views |
   | `supabase/migrations/0004_seed.sql` | Dados de demonstração (opcional, mas recomendado) |
   | `supabase/migrations/0005_paineis.sql` | Avisos, situação operacional, auto-cadastro e funções dos painéis |
   | `supabase/migrations/0006_ajustes.sql` | Cidades da região, rota multiuniversidade, prontuário sequencial |
   | `supabase/migrations/0007_ajustes_ui.sql` | Código de rota gerado, cancelamento de presença, permissões por página, login próprio e canal de mensagens |

   Com a CLI: `supabase link --project-ref <ref>` e `supabase db push`.

3. Crie o primeiro administrador em **Authentication → Users → Add user**:
   - E-mail e senha à sua escolha, com *Auto Confirm User* marcado.
   - Em **User Metadata**, informe:
     ```json
     { "nome": "Seu Nome", "tipo": "admin", "login": "admin" }
     ```
   O trigger `handle_new_user()` cria o registro em `public.perfil` automaticamente. Os demais
   funcionários são criados pela própria tela **Funcionários** (veja abaixo).

4. **Desative a confirmação de e-mail:** em **Authentication → Providers → Email**, desligue
   *Confirm email*. Isso é necessário em dois pontos:
   - no auto-cadastro do estudante, que senão precisa clicar num link antes do primeiro login;
   - na criação de acesso de funcionário sem e-mail real, que usa o endereço sintético
     `<login>@gtporte.local` — ele existe só como identificador e não recebe mensagem alguma.

## 2. Configurar o front-end

```bash
cp .env.example .env      # no PowerShell: Copy-Item .env.example .env
```

Preencha com os dados de **Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## 3. Rodar

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # build de produção em dist/
```

Sem o `.env` a aplicação abre em uma tela de configuração explicando o que falta — não quebra.

---

## 4. Portão de qualidade

O projeto não tem suíte de testes: o único portão automático é o compilador. Para que ele rode
sozinho antes de cada commit, ative o hook versionado — **uma vez por clone**:

```bash
git config core.hooksPath .githooks
```

A partir daí, `git commit` só passa se `tsc --noEmit` estiver limpo e se não houver
`console.log` novo no que está indo para o commit. Em um caso excepcional, `git commit --no-verify`
pula a checagem.

Quem usa o Claude Code herda as mesmas checagens por `.claude/settings.json`, mais um type-check
automático a cada arquivo alterado em `src/`. O roteiro de teste no navegador está em
`.claude/skills/testar-site/` e é invocado com `/testar-site`.

---

## Os três painéis

O login é único: `/login` identifica o perfil e envia cada um para o seu painel (RF21).

| Perfil | Painel | Rota inicial |
|---|---|---|
| `admin` / `operador` | Administrativo — sidebar com 14 telas | `/` |
| `estudante` | Portal do estudante — 6 abas | `/estudante` |
| `motorista` | Portal do motorista — 4 abas | `/motorista` |

### Painel administrativo

| Rota | Tela | Requisitos |
|---|---|---|
| `/` | Visão geral | painel gerencial |
| `/estudantes` | Estudantes + drawer de cadastro | RF01, RF02, RF22 |
| `/documentos` | Validação documental | RF03, RN01, RN07 |
| `/alocacao` | Distribuição automática + rotas expansíveis com ajuste manual | RF09, RF10, RN02, RN03, RN10 |
| `/rotas` | Rotas (código gerado pelo banco) | RF08, RN06, RN14 |
| `/veiculos` | Frota | RF05, RN03 |
| `/motoristas` | Motoristas (e vínculo com o usuário de acesso) | RF04 |
| `/universidades` | Universidades e cidades | RF06, RF07, RN13 |
| `/presenca` | Manifesto diário, com cancelamento justificado | RF13, RF14, RN04 |
| `/relatorios` | 6 relatórios com exportação PDF/Excel | RF17, RF18, RF19, RF23, RF24 |
| `/solicitacoes` | Pedidos abertos por estudantes e motoristas | RF16 |
| `/mensagens` | Caixa de entrada do setor | RF16 |
| `/configuracoes` | Campos globais, conta, mensagens prontas e alertas | — |
| `/funcionarios` | Perfis de acesso e permissões por página (só admin) | RF20 |

O menu lateral pode ser recolhido e as categorias abrem e fecham individualmente; ambos os
estados ficam no `localStorage` do navegador.

### Painel do estudante

| Rota | Tela | Requisitos |
|---|---|---|
| `/cadastro` | Auto-cadastro público (etapa 1: conta) | RF01 |
| `/estudante/completar` | Etapa 2: dados acadêmicos, grade e documentos | RF01, RF02 |
| `/estudante` | **Minha rota** — rota atribuída, motorista, veículo, confirmação de ida/volta, avisos, posição do ônibus | RF11, RF13, RF14, RF15, RF16 |
| `/estudante/documentos` | Envio e reenvio de documentos, com o motivo da rejeição | RF02 |
| `/estudante/historico` | Viagens e alocações anteriores | RF24 |
| `/estudante/mensagens` | Mensagens e solicitações ao setor de transporte | RF16 |
| `/estudante/feedback` | Avaliação do serviço (nota 1–5 + comentário) | RF23 |
| `/estudante/perfil` | Atualização cadastral e da grade horária | RF22 |

### Painel do motorista

| Rota | Tela | Requisitos |
|---|---|---|
| `/motorista` | **Passageiros da rota** — manifesto do dia com quem confirmou ida/volta, botões de situação da viagem e registro de posição | RF12, RF15 |
| `/motorista/rotas` | Rotas sob sua responsabilidade e dados da CNH | RF12 |
| `/motorista/avisos` | Publicação de avisos aos passageiros | RF16 |
| `/motorista/mensagens` | Mensagens e solicitações ao setor de transporte | RF16 |

> Para o motorista acessar o painel, o admin precisa (1) criar o acesso em **Funcionários →
> Novo funcionário** com perfil *Motorista* e (2) selecioná-lo no campo **Usuário de acesso** ao
> editar o motorista em `/motoristas`. Sem esse vínculo ele entra, mas não enxerga rota alguma.

---

## Criação de acesso e permissões (RF20)

O administrador cria os acessos direto em **Funcionários**, sem passar pelo painel do Supabase:

- define **login** e **senha**; o **e-mail é opcional** — sem ele o sistema usa
  `<login>@gtporte.local`, que serve apenas como identificador interno;
- a tela de login aceita login **ou** e-mail: sem `@` no campo, a função `email_do_login()`
  traduz um no outro antes de autenticar;
- a criação usa um segundo cliente Supabase sem sessão persistida (`supabaseCadastro` em
  `lib/supabase.ts`), para que o `signUp` não substitua a sessão do administrador. Nada de
  `service_role` no navegador.

Para o perfil **operador**, o mesmo formulário lista as páginas do painel em checkboxes: só o
que estiver marcado aparece no menu, e abrir a URL diretamente redireciona. O vínculo fica em
`permissao_pagina`, e `minhas_paginas()` devolve a lista já resolvida — **administrador recebe
sempre todas**, independente da tabela. O catálogo das páginas vive em `lib/paginas.ts` e em
`paginas_do_sistema()`; alterar um exige alterar o outro.

---

## Perfis de acesso

| Perfil | Painel admin | Altera rotas (RN06) | Aprova documentos (RN07) |
|---|:---:|:---:|:---:|
| `admin` | todas as telas | sim | sim |
| `operador` | só as telas liberadas | não | não |
| `motorista` | não | não | não |
| `estudante` | não | não | não |

As restrições valem no banco (RLS + `raise exception` nas funções), não apenas na interface —
esconder um botão não seria suficiente. Exemplos concretos:

- `confirmar_presenca()` **ignora** o id recebido quando quem chama é um estudante e usa sempre o
  próprio vínculo, então ninguém confirma presença por outra pessoa (RN09).
- `atualizar_situacao_rota()` só aceita o motorista responsável pela rota (RN08), e mexe apenas na
  situação operacional — o status cadastral continua exclusivo do admin (RN06).
- O bucket `documentos` é privado: o estudante só alcança arquivos sob a pasta `{seu_id}/`.

---

## Rastreabilidade requisito → implementação

| Req. | Onde está |
|---|---|
| RF01 Cadastro de estudantes | `pages/Cadastro.tsx`, `pages/estudante/CompletarCadastro.tsx`, drawer em `pages/Estudantes.tsx` |
| RF02 Upload de documentos | `estudante/MeusDocumentos.tsx` → Storage `documentos/{estudante_id}/…` |
| RF03 Validação de documentos | `pages/Documentos.tsx` + `aprovar_documento()` / `rejeitar_documento()` |
| RF04 Motoristas | `pages/Motoristas.tsx` |
| RF05 Veículos | `pages/Veiculos.tsx` |
| RF06 Universidades | `pages/Universidades.tsx` |
| RF07 Cidades | `pages/Universidades.tsx` (painel lateral) |
| RF08 Rotas | `pages/Rotas.tsx` |
| RF09 Distribuição automática | `executar_distribuicao()` em `0003_funcoes.sql` |
| RF10 Ajuste manual | `mover_alocacao_manual()` + lista de rotas em `pages/Alocacao.tsx` |
| RF11 Rotas do estudante | `minha_rota()` + `estudante/MinhaRota.tsx` |
| RF12 Passageiros do motorista | `vw_minhas_rotas_motorista` + `motorista/Passageiros.tsx` |
| RF13/RF14 Presença ida/volta | `confirmar_presenca()`, `estudante/MinhaRota.tsx`, `pages/Presenca.tsx` |
| RF15 Tempo real | `localizacao_rota`, `ultima_localizacao()`, `atualizar_situacao_rota()` |
| RF16 Comunicação motorista→estudante | tabela `aviso_rota`, `motorista/Avisos.tsx` |
| RF16 Canal com o setor | tabela `mensagem`, `pages/Mensagens.tsx`, `pages/MinhasMensagens.tsx` |
| RF17/18/19 Relatórios | views `vw_*` + `pages/Relatorios.tsx` + `lib/exportar.ts` |
| RF20 Perfis de acesso | `pages/Funcionarios.tsx` + `0002_rls.sql` + `permissao_pagina` / `minhas_paginas()` |
| RF21 Autenticação | `auth/AuthProvider.tsx`, `auth/RotaProtegida.tsx` |
| RF22 Atualização cadastral | `estudante/MeuPerfil.tsx` |
| RF23 Feedback | `estudante/Feedback.tsx` |
| RF24 Histórico | `estudante/Historico.tsx` + `vw_historico_utilizacao` |
| RN01 Só aloca com doc aprovada | filtro em `executar_distribuicao()` |
| RN02 Compatibilidade de horários | `horario_partida`/`horario_retorno` × `grade_horaria` |
| RN03 Capacidade máxima | `executar_distribuicao()` e `mover_alocacao_manual()` |
| RN04 Ida/volta independentes | colunas separadas em `presenca`; cancelamento por `cancelar_presenca()` |
| RN05/RN16/RN17 Regras da volta | `confirmar_presenca()` |
| RN06/RN07 Exclusivo do admin | policies `rota_*_admin`, `documento_update_admin` |
| RN08/RN09 Visibilidade restrita | policies `*_motorista` / `*_propri*` e guardas nas funções |
| RN10 Preservar ajuste manual | `origem = 'manual'` protegida na distribuição |
| RN12 Log administrativo | triggers `trg_log_*` |
| RN13 Universidade válida | FK `estudante.universidade_id` NOT NULL |
| RN14 Motorista por rota | `rota.motorista_id` NOT NULL |
| RN15 Preservar histórico | `on delete restrict` + flag `ativa` em `alocacao_estudante` |
| RNF03 Distribuição < 10s | RPC retorna `duracao_ms`, exibido na tela de Alocação |

---

## Como o motor de distribuição funciona (RF09)

1. Seleciona estudantes ativos, com documentação **aprovada** (RN01) e grade horária cadastrada.
2. Encerra as alocações anteriores de origem `automatica`; as `manual` são preservadas (RN10).
3. Para cada estudante, ordenado por antiguidade de cadastro, procura a rota que:
   - parte **antes** do início das aulas e retorna **depois** do término (RN02);
   - atende a universidade do estudante;
   - ainda tem vaga no veículo (RN03).
4. Sem vaga em rota compatível → `fila_espera`. Sem rota compatível → `sem_rota`.
5. Atualiza o status das rotas e grava no log administrativo.

Retorna `{ alocados, fila_espera, sem_rota, duracao_ms, mensagens[] }`.

---

## Estrutura

```
supabase/migrations/   5 migrations SQL
src/
  auth/                AuthProvider e guarda de rotas por perfil
  components/          ícones e componentes de UI
  hooks/               queries reutilizadas (react-query)
  layouts/             AppShell (admin), PortalShell (estudante/motorista)
  lib/                 cliente Supabase, tipos, formatadores, exportação
  pages/               telas públicas e administrativas
  pages/estudante/     painel do estudante
  pages/motorista/     painel do motorista
_prototipo/            mockup original, mantido como referência visual
```

## Verificação

```sql
-- RN03: nenhuma rota pode exceder a capacidade do veículo
select codigo, ocupacao, capacidade_maxima
from vw_ocupacao_rota where ocupacao > capacidade_maxima;   -- deve retornar 0 linhas

-- RNF03: tempo de execução da distribuição
select executar_distribuicao();                             -- veja duracao_ms < 10000
```

Roteiro ponta a ponta:

1. Cadastre-se em `/cadastro`, complete a etapa 2 e envie os 4 documentos.
2. Como admin, aprove tudo em `/documentos` e rode a distribuição em `/alocacao`.
3. Volte como estudante: a rota aparece em `/estudante`; confirme a ida.
4. Como motorista vinculado àquela rota, veja a confirmação em `/motorista`, mude a situação para
   *Em rota* e publique um aviso — ele aparece no painel do estudante.
5. Confira `log_administrativo`: a edição de rota e o ajuste manual devem estar lá (RN12).
