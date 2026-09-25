# Tempo real, conversas, notificações e raio das universidades

Este documento responde a três perguntas do projeto:

1. Quais ferramentas e APIs sustentam o trajeto em tempo real, os chats e a
   atualização de dados.
2. Por que o SQLite distribuído junto com o aplicativo não resolve isso.
3. Como conferir que o que o estudante envia (documentos, mensagens,
   atividades) chega de fato à secretaria.

---

## 1. Ferramentas e APIs

| Função | Ferramenta | Onde está no código |
|---|---|---|
| Banco central, regras e permissões | **Supabase / PostgreSQL** com Row Level Security e funções PL/pgSQL | `supabase/migrations/` |
| Chat e atualização em tempo real | **Supabase Realtime** (*Postgres Changes*): o app assina inserções em `conversa_mensagem`, `notificacao` e `localizacao_rota`. A RLS vale também para o Realtime — cada usuário só recebe as linhas que pode ler. | `estudante-app/src/hooks/useConversas.ts`, `useNotificacoes.ts`; `motorista-app/src/hooks/useMotorista.ts`; `src/pages/Conversas.tsx` |
| Posição do ônibus | **Geolocation API** do navegador (`navigator.geolocation.watchPosition`), gravada em `localizacao_rota` a cada 15 s | `motorista-app/src/pages/Viagem.tsx` |
| Mapa | **Leaflet** + blocos do **OpenStreetMap** (gratuitos, sem chave) | `estudante-app/src/components/MapaRota.tsx`, `motorista-app/src/components/MapaMotorista.tsx` |
| Raio das universidades (geofence) | Gatilho no PostgreSQL (`tg_geofence_universidade`) com distância por *haversine* — dispensa PostGIS | `0027_conversas_motivos_geofence.sql` |
| Notificação com o app aberto | Realtime + **Notification API** do navegador | `estudante-app/src/lib/push.ts` |
| Notificação com o app fechado | **Web Push** (VAPID) + **Supabase Edge Function** `enviar-push`, disparada por *Database Webhook* a cada linha nova em `notificacao` | `supabase/functions/enviar-push/`, `estudante-app/public/push-sw.js` |

### Fluxo do raio das universidades

```
motorista (GPS)  ──insert──▶  localizacao_rota
                                   │  gatilho geofence_universidade
                                   ▼
                    distância até cada universidade da rota
                    ├─ entrou no raio de A → notificacao: "O motorista está próximo"   (alunos de A)
                    └─ saiu do raio de A   → notificacao: "O ônibus já está a caminho" (alunos da próxima universidade)
                                   │
                  ┌────────────────┴────────────────┐
             Realtime (app aberto)          Webhook → Edge Function → Web Push (app fechado)
```

* A secretaria define latitude, longitude e raio (50 m a 10 km) de cada
  universidade em **Universidades**. Sem coordenadas, vale a posição da
  parada ligada àquela universidade.
* A ordem das universidades é a ordem das paradas; na volta (a partir de
  30 min antes do horário de retorno) a ordem se inverte.
* Cada aviso sai uma vez por dia e por trecho (`passagem_universidade`). Há
  10% de folga na saída do raio para o GPS oscilando na borda não repetir
  aviso.
* Só recebe aviso quem está alocado na rota naquele dia, tem cadastro
  validado, usa aquele trecho e não cancelou a presença.
* O raio aparece **somente** no mapa do motorista (`mapa_motorista()`); as
  funções do estudante não expõem o raio.

### Ativar o push com o app fechado

1. Gere o par de chaves uma vez: `npx web-push generate-vapid-keys`.
2. Publique a função e grave os segredos:
   ```bash
   supabase functions deploy enviar-push --no-verify-jwt
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ti@exemplo.gov.br
   ```
3. Em **Database → Webhooks**, crie um hook na tabela `public.notificacao`,
   evento `INSERT`, tipo *Supabase Edge Function*, função `enviar-push`.
4. No app do estudante, defina `VITE_VAPID_PUBLIC_KEY` com a chave pública e
   publique de novo. O aluno liga os avisos em **Perfil → Avisos no celular**.

Sem esses passos tudo continua funcionando, mas a notificação só aparece
com o app aberto (sino + notificação do sistema). No iPhone, o Web Push
exige iOS 16.4+ e o app instalado na tela inicial.

### Realtime

A migration 0027 adiciona `conversa_mensagem`, `notificacao` e
`localizacao_rota` à publicação `supabase_realtime`. Confira em **Database →
Publications** se as três tabelas aparecem. Os apps continuam consultando em
intervalo (30 s) como reserva, caso a conexão do Realtime caia.

---

## 2. Por que não SQLite junto do download

O SQLite é um banco **local, de um aparelho só**. Instalado junto com o
aplicativo, cada celular teria o seu próprio arquivo, sem ligação com os
demais:

* a posição do ônibus gravada no celular do motorista não chegaria ao
  celular do estudante;
* a mensagem do estudante ficaria no aparelho dele — a secretaria nunca a
  veria;
* documentos e cadastros não chegariam ao painel da secretaria;
* não há como validar permissões: quem tem o arquivo tem todos os dados.

Tempo real entre pessoas diferentes exige um servidor central que todos
acessem. É o papel do Supabase (PostgreSQL hospedado + Realtime + Storage +
Auth), que o projeto já usa. Se um dia for preciso funcionar sem internet, o
caminho é um **cache local** (IndexedDB, ou SQLite em app nativo) que
sincroniza com o servidor quando a conexão volta — nunca o banco principal.
O app do estudante já é um PWA com cache das últimas respostas para
exibir dados salvos quando está offline.

---

## 3. Conferência: o que o estudante envia chega à secretaria?

### Onde cada dado aparece no painel

| O estudante faz no app | Tabela | Onde a secretaria vê |
|---|---|---|
| Envia ou reenvia documento | `documento` + Storage `documentos/` | **Documentos** |
| Altera dado cadastral | `alteracao_cadastral` | **Alterações cadastrais → Dados cadastrais** |
| Altera a grade de aulas | `alteracao_grade` | **Alterações cadastrais → Grade de aulas** *(novo — antes nenhuma tela lia essa tabela)* |
| Conversa com a secretaria | `conversa`, `conversa_mensagem` | **Conversas do app → Atendimento** *(novo — antes o app gravava, mas o painel só lia a tabela antiga `mensagem`)* |
| Conversa com o motorista | `conversa`, `conversa_mensagem` | App do motorista → **Mensagens**; secretaria acompanha em **Conversas do app → Com motoristas** |
| Confirma/cancela presença, pede volta, troca de ônibus | `presenca`, `solicitacao_volta`, `troca_rota` | **Presença**; motorista decide volta e troca no app dele |
| Tudo acima, em ordem cronológica | função `atividade_estudante()` | Histórico de atividade do aluno (mesma função serve à secretaria) |

### Teste automatizado ponta a ponta

`supabase/testes/fluxo_estudante_secretaria.sql` executa o fluxo completo
**com as permissões reais de cada perfil** (RLS ligada) e desfaz tudo no fim
(`ROLLBACK`), então pode ser rodado no SQL Editor do Supabase:

1. Estudante na fila de validação não vê rota, paradas, GPS, grupo nem motorista.
2. Estudante envia documento, alteração cadastral, grade e mensagem.
3. Secretaria enxerga os quatro, responde a conversa e valida o cadastro.
4. Estudante validado recebe rota, grupo e as notificações de resposta e validação.
5. Motorista passa pelo raio de duas universidades: os alunos recebem
   “a caminho” e “próximo”, uma vez cada; o estudante não acessa o raio.

Cada etapa imprime `OK ...` ou interrompe com `FALHOU ...`.
