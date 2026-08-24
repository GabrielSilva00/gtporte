# Automação de desenvolvimento com agente de IA no GTPorte

**Trabalho de Conclusão de Curso 2026 — Grupo TDS-2026-008**
Tecnologia em Desenvolvimento de Sistemas · 5º termo
Relatório de processo e aprendizados · 24/08/2026

---

## 1. Contexto

O GTPorte é um sistema de gestão de transporte acadêmico municipal, construído em React 18 com
TypeScript, Vite e Tailwind sobre Supabase (PostgreSQL, autenticação, armazenamento de arquivos e
Row Level Security). Ele atende três públicos em painéis separados: o setor de transporte, o
estudante e o motorista.

Depois de uma rodada de validação com o cliente, surgiram dezesseis solicitações de mudança. Elas
iam de ajustes visuais simples — remover dois textos da tela de entrada, reduzir o tamanho de uns
cards — a mudanças estruturais de verdade: um fluxo de aprovação entre estudante e motorista, um
cadastro de motorista com os campos exigidos pela legislação de transporte escolar, e um bloco
institucional de configuração com cerca de setenta campos.

Este relatório registra **como** essas mudanças foram executadas com o apoio de um agente de IA
(Claude Code), o que foi automatizado, o que deu certo, o que não deu, e o que faríamos diferente.
O objetivo não é descrever o produto — isso está no README e no relatório técnico — e sim o
processo de trabalho.

---

## 2. O que foi entregue

| Indicador | Valor |
|---|---|
| Commits na branch de trabalho | 12 |
| Arquivos alterados | 49 |
| Linhas adicionadas / removidas | 8.071 / 601 |
| Arquivos novos | 26 |
| Migrations de banco novas | 6 (`0008` a `0012`, mais `0014` de correções) |
| Tabelas no banco | 15 → 22 |
| Telas do painel do motorista | 4 → 6 |
| Relatórios gerenciais | 6 → 10 |

As dezesseis solicitações foram atendidas. As mudanças de banco ficaram versionadas como migrations
idempotentes no repositório, para serem aplicadas no painel do Supabase — o agente não teve acesso
ao banco de produção, o que foi uma decisão consciente do grupo.

---

## 3. Como o trabalho foi organizado

### 3.1 Planejamento antes da execução

O primeiro passo não foi escrever código, e sim mapear o sistema. Três agentes de exploração
percorreram o repositório em paralelo com escopos diferentes — telas administrativas principais,
telas administrativas restantes, e infraestrutura mais modelo de dados — e devolveram um retrato do
que já existia, com caminho de arquivo e número de linha.

Isso mudou o resultado de forma concreta. O levantamento mostrou que:

- não existia componente de abas: cada tela que precisava reimplementava com botões soltos, em duas
  variações visuais diferentes;
- a paleta de cores estava duplicada em sete lugares;
- a tabela `documento` só tinha `estudante_id`, então "documentos do motorista" não era um ajuste de
  tela, era modelagem nova;
- `src/lib/paginas.ts` espelha à mão uma função do banco, sem nada garantindo que as duas listas
  concordem.

Nenhuma dessas informações estava no enunciado das solicitações. Todas mudaram o plano.

### 3.2 Decisões que precisaram de gente

Quatro pontos foram levados ao usuário antes de executar, porque interpretações diferentes levariam
a trabalhos diferentes:

1. **Ambiguidade real no enunciado.** Os itens 1 e 2 falavam em "página inicial" e "página de
   login" como se fossem telas distintas, mas o layout descrito (imagem à esquerda, campo estreito à
   direita) e os dois textos a remover estavam ambos na tela de login. Os itens 3 e 4, por sua vez,
   falavam de "página inicial" querendo dizer o painel pós-login. Executar sem perguntar teria
   produzido metade do trabalho no lugar errado.
2. **Formato do link de acesso** (item 16): link com token de convite ou link simples copiável.
3. **Estratégia de banco**: gerar as migrations no repositório ou dar acesso ao Supabase ao agente.
4. **Onde a automação deveria viver**: versionada no repositório ou apenas na máquina de um
   integrante.

### 3.3 Execução em fases

O trabalho foi dividido em fases, com um commit ao fim de cada uma:

| Fase | Conteúdo | Commits |
|---|---|---|
| 0 | Componentes base reutilizáveis (`Tabs`, `Campo`, `UploadFoto`) | 1 |
| 1 | Ajustes visuais rápidos (itens 1, 2, 3, 4, 7, 11) | 1 |
| 2 | Seis migrations de banco | 1 |
| 3 | Telas que consomem as migrations (itens 5, 6, 8, 9, 12, 13, 14, 15, 16) | 6 |
| 4 | Skill, hooks e agente revisor | 1 |
| 5 | Tarefa delegada e correções da revisão | 1 |
| 6 | Documentação | 1 |

A fase 0 existir foi uma escolha deliberada. Três das mudanças pediam formulários em abas, e duas
somavam cerca de cento e dez campos. Sem extrair antes um componente de abas e um renderizador de
campo declarativo, as telas de motorista e de configurações teriam passado de mil linhas de JSX
repetido cada uma. Com eles, os campos viraram dados: `src/lib/motorista.ts` e
`src/lib/organizacao.ts` descrevem os formulários como listas de objetos, e as telas apenas
percorrem essas listas.

---

## 4. A automação criada

Toda a automação ficou versionada no repositório, em `.claude/` e `.githooks/`, para valer para o
grupo inteiro e não apenas para quem estivesse com o agente aberto.

### 4.1 Skill de teste — `/testar-site`

`.claude/skills/testar-site/` é um roteiro de verificação ponta a ponta no navegador. O projeto não
tem suíte de testes automatizados; `tsc --noEmit` garante que o código compila, não que funciona.
A skill cobre essa diferença.

Ela sobe o servidor de desenvolvimento, percorre um checklist de 45 itens nos três painéis, lê o
console do navegador filtrando por erros, e devolve uma tabela de aprovado, reprovado ou bloqueado
por item.

Três detalhes que valeram a pena:

- **"Bloqueado" é diferente de "reprovado".** Como as migrations são aplicadas manualmente, uma tela
  pode falhar simplesmente porque a tabela ainda não existe. Tratar isso como defeito produziria um
  relatório enganoso, então a skill primeiro confere se as tabelas existem e classifica de acordo.
- **Limite de duas tentativas por item.** Sem esse limite, um agente insiste no mesmo botão
  indefinidamente.
- **Uma seção dedicada à regressão mais provável.** A migration `0012` reescreveu
  `confirmar_presenca`, que é usada tanto pelo aluno quanto pelo balcão. O caminho do balcão
  precisava continuar idêntico. O checklist trata isso como item destacado, não como mais uma linha.

### 4.2 Hooks de qualidade

| Hook | Evento | O que faz |
|---|---|---|
| `checar-tipos.cjs` | `PostToolUse` em `Edit\|Write` | Roda `tsc --noEmit` após cada alteração em `src/` e devolve os erros ao agente |
| `antes-do-commit.cjs` | `PreToolUse` em `Bash` | Intercepta `git commit`: barra se o projeto não compilar ou se houver `console.log` novo no índice |
| `.githooks/pre-commit` | Hook nativo do git | A mesma checagem fora do agente, para quem commita pelo terminal ou pelo editor |

O segundo é o hook atrelado a uma tarefa do git. Ele respeita `--no-verify` para o caso excepcional,
e o hook nativo garante que o portão vale para o grupo todo — basta rodar uma vez por clone:

```
git config core.hooksPath .githooks
```

**Uma decisão técnica que mudou o resultado:** a primeira versão dos hooks foi escrita em shell,
usando `jq` para ler o JSON de entrada. Ao testar, descobrimos que `jq` não está instalado na
máquina de desenvolvimento. Reescrevemos em Node — que o projeto já exige — e o hook passou a
funcionar igual no Git Bash, no PowerShell e no Linux, sem dependência nova. Depois disso, uma
segunda correção: a chamada usava `npx` com `shell: true`, o que gerava um aviso de depreciação do
Node em toda execução; passamos a invocar o compilador local direto (`node_modules/typescript/bin/tsc`).

Ambos os hooks foram testados nos dois caminhos antes de serem versionados: com o código limpo, e
com um defeito proposital inserido e depois revertido.

### 4.3 Agente revisor

`.claude/agents/revisor-gtporte.md` define um subagente especializado no que o compilador não pega:
função `security definer` sem validação de autor, componentes de `ui/` reimplementados à mão, cor
fora da paleta do Tailwind, e divergência entre `src/lib/paginas.ts` e a função `paginas_do_sistema()`
do banco.

A escolha do escopo foi deliberada: um revisor genérico repetiria o que o `tsc` já faz. O valor está
em codificar o conhecimento específico deste projeto — sobretudo o fato de que toda RPC do Supabase
roda como `security definer` e, portanto, ignora a Row Level Security por definição. Uma função nova
que esqueça de checar quem está chamando é uma falha de segurança que nenhuma ferramenta genérica
apontaria.

---

## 5. Tarefa de desenvolvimento delegada a um agente

Para exercitar a delegação de uma unidade fechada de trabalho, escolhemos um problema real
encontrado no levantamento da fase de planejamento.

### 5.1 O problema

O mapa de cores da situação operacional da rota estava duplicado **literalmente**, com os mesmos
seis valores hexadecimais, em três arquivos:

- `src/pages/Dashboard.tsx`
- `src/pages/estudante/MinhaRota.tsx`
- `src/pages/motorista/MinhasRotas.tsx`

### 5.2 Por que esta tarefa

Ela tem as três características que tornam uma tarefa boa para delegar: **escopo fechado** (três
arquivos nomeados), **critério de sucesso objetivo** (`tsc --noEmit` limpo e build passando), e
**resultado verificável sem julgamento subjetivo** (a aparência não pode mudar).

### 5.3 O prompt

O prompt entregue ao agente continha, além do problema:

- os caminhos e as linhas aproximadas das três duplicatas;
- a função canônica já criada (`badgeSituacaoOperacional` em `src/lib/format.ts`) e seu tipo de
  retorno;
- **uma armadilha explícita**: os arquivos usam `ROTULO_SITUACAO_OPERACIONAL` para o texto e
  `COR_SITUACAO` para a cor; a função nova traz as duas coisas, então o import antigo pode ou não
  ficar sem uso, e isso precisa ser verificado caso a caso;
- o comando exato de verificação, com a observação de **não usar `npx`** por ser lento nesta
  máquina;
- limites: não commitar, não tocar em outros arquivos, manter os comentários em português.

Nomear a armadilha antecipadamente foi o que mais rendeu. É exatamente o tipo de detalhe que produz
um erro de compilação silencioso — variável importada e não usada — e que custa uma ida e volta
inteira quando não é dito.

### 5.4 Resultado

O agente executou a tarefa em uma passagem, sem precisar de correção de rumo. O que ele entregou:

- removeu as três constantes duplicadas;
- ajustou os imports caso a caso — em dois arquivos `ROTULO_SITUACAO_OPERACIONAL` ficou sem uso e
  foi removido, no terceiro continuou sendo usado em outro ponto e foi mantido, que era exatamente
  a armadilha apontada no prompt;
- adaptou cada ponto de uso ao formato do JSX local: onde havia o componente `<Badge>`, passou a
  função direto; onde o JSX aplicava cor via `style`, leu `.bg` e `.fg`;
- preservou o `.toUpperCase()` que já existia, para o texto exibido não mudar;
- verificou com `tsc --noEmit` limpo e `npm run build` completo.

**Conferência independente.** Confirmamos por conta própria que nenhuma ocorrência de
`COR_SITUACAO` restou no código, que os rótulos de `badgeSituacaoOperacional` são idênticos aos de
`ROTULO_SITUACAO_OPERACIONAL`, e que o build passa.

Uma ressalva: em `MinhaRota.tsx` o agente derivou o valor fora do bloco condicional e precisou de
asserção não-nula (`badgeSituacao!`) em três lugares. É seguro — o trecho só renderiza sob
`rota &&` — mas é o tipo de solução que enfraquece a checagem para contornar um detalhe de escopo.
Movemos o cálculo para dentro do bloco, o que dispensou a asserção. Vale como registro de que
**revisar a entrega do agente continua sendo necessário mesmo quando ela passa em todos os testes**:
o critério objetivo estava satisfeito, e ainda assim havia o que melhorar.

---

## 6. Revisão automatizada da branch

Depois de fechar as dezesseis solicitações, rodamos o agente revisor sobre a branch inteira
comparada com `main` — 44 arquivos, 7.227 linhas adicionadas até aquele ponto. O `tsc --noEmit` passava limpo, então
tudo o que ele encontrou é, por definição, o que o compilador não vê.

Foram **onze achados**, quatro deles graves. Os mais relevantes:

**1. Dados pessoais do motorista expostos.** A migration `0011` acrescentou CPF, RG, data de
nascimento, endereço residencial completo e e-mail pessoal à tabela `motorista`. Essa tabela tinha,
desde o início do projeto, uma policy de leitura `auth.role() = 'authenticated'` — escrita quando ela
continha apenas nome, telefone e CNH, para que o estudante pudesse ver quem dirige a rota dele.
Ninguém revisou a policy ao ampliar a tabela. O resultado: qualquer estudante logado conseguia ler
o CPF e o endereço de toda a equipe de motoristas.

**2. Motorista podia aprovar o próprio documento.** A policy de inserção em `documento_motorista`
validava o `motorista_id`, mas não o `status`. Como existe um gatilho que recalcula a situação
documental na hora, bastava inserir um documento já com `status = 'aprovado'` por chamada direta à
API para se auto-aprovar, contornando a regra de que só o administrador aprova. A tela enviava
`'pendente'` por convenção, não por obrigação. A mesma falha existia no lado do estudante desde o
início do projeto.

**3. Uma RPC contornando a Row Level Security.** A função `ocupacao_por_data`, criada na migration
`0008`, repete o trabalho de uma view que havia sido declarada `security_invoker = true`
justamente para que a RLS valesse. A função nova, sendo `security definer` e sem checar quem chama,
desfazia essa decisão.

**4. Indicadores da Visão geral zerados em silêncio.** Este é o achado mais instrutivo. A RPC
`ocupacao_por_data` devolve seis colunas; o hook a tipava como `OcupacaoRota`, que tem quinze. O
Dashboard filtrava por `o.status`, campo que a RPC não devolve — então "Rotas em operação" mostrava
zero, "em revisão" mostrava zero e a "Ocupação média" somava capacidade zero. **Sem nenhum erro de
compilação**, porque a conversão de tipo forçada (`as OcupacaoRota[]`) mentia para o compilador.

Os demais achados: salvar um bloco em Configurações apagava o que estava digitado nos outros blocos
ainda não salvos; os filtros de relatório vazavam de um relatório para o outro, produzindo recorte
fantasma em documento de prestação de contas; o `UploadFoto` criava um object URL por render sem
revogar; um checkbox usava hexadecimal cru divergindo do token da paleta; e o cancelamento de
solicitação não era registrado no log de auditoria.

O revisor também informou explicitamente o que **não** encontrou: nenhum componente de `ui/`
reimplementado à mão nas telas novas, RLS completa nas sete tabelas criadas, listas de páginas do
front e do banco em sincronia, e o retorno jsonb de `minha_rota()` batendo campo a campo com o tipo
TypeScript.

**Todos os achados acionáveis foram corrigidos** na migration `0014_correcoes_revisao.sql` e no
commit `f5bae1f`. O seed de demonstração, que estava dentro de `supabase/migrations/` e seria
aplicado por um `supabase db push` em produção, foi movido para `supabase/seed/`.

**O que isso ensina.** Os três primeiros achados são falhas de segurança que passariam despercebidas
em revisão humana por serem *invisíveis no diff*: em nenhum deles o código errado foi escrito nesta
branch. O que a branch fez foi **acrescentar colunas a uma tabela cuja policy já existia** — e a
policy, que não aparece no diff, deixou de ser adequada. Revisar só o que mudou não bastava; era
preciso revisar o que o que mudou *afetou*.

O quarto mostra o custo de uma conversão de tipo forçada: `as OcupacaoRota[]` transformou um erro
que o compilador teria pego numa tela que mostra zero sem reclamar.

---

## 7. O que funcionou

**Explorar antes de planejar.** Os três agentes de exploração custaram alguns minutos e evitaram
retrabalho em pelo menos quatro pontos — o mais caro deles seria descobrir só na hora de codificar
que "documentos do motorista" exigia modelagem nova, e não um filtro de tela.

**Perguntar quando a ambiguidade é real.** Quatro perguntas no início pouparam metade de uma fase de
trabalho no lugar errado. O critério aplicado foi: perguntar quando leituras diferentes levariam a
trabalhos diferentes; decidir sozinho quando existe um padrão óbvio.

**Fazer a base antes das telas.** A fase 0, que não entregou nenhuma funcionalidade visível, foi o
que permitiu que as três telas de formulário grandes ficassem legíveis.

**Commit por fase, com mensagem explicando o porquê.** As mensagens registram as decisões de projeto
— por que uma tabela irmã em vez de generalizar `documento`, por que uma coluna `situacao` nova em
vez de estender o enum existente. Isso vale mais para o relatório técnico do que qualquer comentário
no código.

**Testar o hook antes de versionar.** Foi o que revelou a ausência do `jq`. Um hook quebrado é pior
que hook nenhum, porque falha em silêncio.

---

## 8. O que não funcionou

**Heredoc de shell com conteúdo grande.** Editar arquivos passando blocos extensos de código por
heredoc falhou duas vezes com erro de sintaxe do shell. A solução foi escrever scripts de edição em
Node e executá-los — mais previsível, e com a vantagem de o script ficar disponível para reexecutar.

**Codificação de caracteres no Windows.** Duas ocorrências. A saída do Python quebrava ao imprimir
caracteres combinantes no console (cp1252), e a correção da faixa de diacríticos em `exportar.ts`
precisou ser feita via Node para escrever `̀-ͯ` escapado — tanto o editor quanto o Python
inseriam os caracteres crus, invisíveis no fonte, que era exatamente o defeito original.

**Fim de linha CRLF.** As primeiras edições por script falhavam ao procurar trechos de várias linhas,
porque os arquivos do repositório usam CRLF e os padrões de busca usavam LF. Resolvido com um
utilitário que normaliza ao ler e restaura ao gravar. É o tipo de atrito que consome tempo sem
produzir nada.

**Confiar em ferramenta não verificada.** Escrever os hooks assumindo `jq` instalado foi otimismo.
Custou uma reescrita completa.

**Um laço infinito no próprio gerador deste relatório.** O conversor de Markdown para `.docx`
tratava linhas iniciadas por `*` como lista. Um parágrafo que começa com `**Negrito**` casa com
esse padrão sem ser lista: o laço recusava a linha, não avançava o índice, e o script travava. Só
apareceu porque o texto deste relatório usa negrito no início de vários parágrafos. É um lembrete de
que código auxiliar — script de build, gerador, ferramenta de apoio — merece o mesmo cuidado que o
código do produto, e frequentemente não recebe.

---

## 9. Como o processo pode melhorar

**1. Testes automatizados de verdade.** É a lacuna maior. Hoje `npm run lint` é apenas
`tsc --noEmit`: garante que o código compila, não que funciona. Vitest com Testing Library nas
funções puras de `src/lib/` (`format.ts`, `exportar.ts`) e Playwright no fluxo de presença dariam
uma rede de segurança real, e o hook de pré-commit passaria a rodá-los.

**2. Verificar automaticamente a sincronia front/banco.** `src/lib/paginas.ts` espelha à mão a função
`paginas_do_sistema()` da migration `0007`. Uma página adicionada em um lado e esquecida no outro
falha em silêncio. Um teste que compare as duas listas resolveria em poucas linhas.

**3. Tipos gerados a partir do banco.** O Supabase CLI gera tipos TypeScript a partir do schema real
(`supabase gen types typescript`). Hoje `src/lib/types.ts` é mantido à mão, e o retorno jsonb de
`minha_rota()` é tipado por confiança: um campo adicionado no TypeScript mas esquecido no SQL chega
como `undefined` sem nenhum erro de compilação.

**4. Ambiente de banco descartável.** As migrations foram escritas sem poder executá-las — só foi
possível conferir estruturalmente o balanceamento das marcações de citação. Um Postgres local ou um
projeto Supabase de teste permitiria aplicar e reverter cada migration antes de versioná-la.

**5. Paleta em um lugar só.** As cores estão em `tailwind.config.js`, em `src/lib/format.ts` e
espalhadas em hexadecimal cru por várias telas. Consolidar em tokens CSS eliminaria uma classe
inteira de inconsistência.

**6. Escrever o prompt da tarefa delegada como se fosse para um colega novo.** O que mais melhorou o
resultado da delegação não foi descrever o objetivo — foi nomear a armadilha, dar o comando exato de
verificação e declarar os limites. Vale como padrão para as próximas.

---

## 10. Conclusão

As dezesseis solicitações foram atendidas, o repositório passou a carregar sua própria automação de
qualidade, e o processo ficou documentado.

O aprendizado que atravessa todo o trabalho é que o agente de IA rende muito mais em **preparação e
verificação** do que em digitação. As horas que produziram mais valor foram as de exploração inicial
— que revelaram quatro problemas estruturais não previstos no enunciado — e as de teste dos hooks —
que revelaram uma dependência inexistente antes de ela quebrar na máquina de outro integrante.
Escrever o código foi a parte mais rápida e menos arriscada.

O segundo aprendizado é que automação só vale quando está versionada. Um hook na máquina de um
integrante é um hábito pessoal; um hook em `.githooks/` é uma regra do projeto.

E o terceiro, que aparece nas seções 7 e 8 em partes iguais: o limite do agente não está no que ele
sabe escrever, e sim no que ele consegue **verificar**. Onde havia critério objetivo — compila, o
build passa, a aparência não mudou — o resultado foi confiável. Onde não havia — as migrations, que
não puderam ser executadas — o resultado continua dependendo de conferência humana, e o relatório
diz isso explicitamente em vez de fingir o contrário.

---

## Anexo · Estrutura da automação no repositório

```
.claude/
  settings.json                   hooks e permissões do projeto
  agents/
    revisor-gtporte.md            subagente de revisão
  hooks/
    checar-tipos.cjs              type-check após cada edição em src/
    antes-do-commit.cjs           portão antes do git commit
  skills/
    testar-site/
      SKILL.md                    roteiro de teste no navegador
      checklist.md                45 itens nos três painéis
.githooks/
  pre-commit                      mesma checagem fora do agente
docs/
  relatorio-automacao-gtporte.md  fonte deste documento
  relatorio-automacao-gtporte.docx
scripts/
  gerar-relatorio.py              converte o Markdown em .docx
```
