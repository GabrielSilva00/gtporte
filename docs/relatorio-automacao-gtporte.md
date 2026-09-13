# Skills, Hooks e Agentes de IA no desenvolvimento

**Relatório de experiência e aprendizados**
Trabalho de Conclusão de Curso 2026 — Grupo TDS-2026-008
Tecnologia em Desenvolvimento de Sistemas · 5º termo · 24/08/2026

---

## 1. Objetivo e contexto

Este relatório documenta a criação e o uso de três mecanismos de automação com agente de IA —
**Skill**, **Hooks** e **agentes especializados** — durante uma rodada de manutenção do GTPorte,
sistema de transporte acadêmico do nosso TCC (React + TypeScript sobre Supabase).

O foco aqui é o **processo e o resultado da automação**, não as funcionalidades entregues.

**Agente de IA utilizado:** Claude Code, da Anthropic, executando o modelo **Claude Opus 5**, em
terminal, com acesso ao sistema de arquivos e ao Git do projeto.

Um dado importante do contexto: o projeto **não possui testes automatizados**. O único portão de
qualidade existente era o comando `npm run lint`, que na prática é apenas `tsc --noEmit` — ele
garante que o código compila, não que funciona. Toda a automação foi desenhada em torno dessa
limitação.

---

## 2. A Skill criada

**`/testar-site`** — arquivo `.claude/skills/testar-site/SKILL.md`, com o checklist de apoio em
`checklist.md`.

Uma Skill é um conjunto de instruções empacotado que o agente carrega quando a tarefa corresponde
ao que ela cobre. Esta descreve um roteiro de verificação do sistema rodando no navegador: sobe o
servidor, percorre 45 itens nos três painéis (administrativo, estudante e motorista), lê o console
em busca de erros e devolve uma tabela de aprovado, reprovado ou bloqueado por item.

Três decisões de projeto que valeram a pena:

- **Distinguir "bloqueado" de "reprovado".** Como as mudanças de banco são aplicadas à mão, uma
  tela pode falhar só porque a tabela ainda não existe. Tratar isso como defeito produziria um
  relatório enganoso, então a Skill primeiro verifica se as estruturas existem.
- **Limite de duas tentativas por item.** Sem esse limite, o agente insiste indefinidamente no
  mesmo botão que não responde.
- **Destacar a regressão mais provável.** Uma função central do banco havia sido reescrita e
  precisava continuar funcionando para dois públicos diferentes. O checklist trata isso como item
  em destaque, não como mais uma linha no meio de 45.

> **Resultado alcançado:** a Skill foi criada, versionada e revisada, mas **não chegou a ser
> executada de ponta a ponta**, porque as mudanças de banco ainda não foram aplicadas no ambiente
> do projeto. O que temos hoje é o roteiro pronto, não a evidência de execução. Registramos isso
> como pendência real, e não como entrega concluída.

---

## 3. Os Hooks criados

Hooks são comandos que o agente executa automaticamente em momentos definidos do seu ciclo de
trabalho. Criamos três, todos versionados no repositório.

| Hook | Quando dispara | O que faz |
|---|---|---|
| `checar-tipos.cjs` | Após cada edição de arquivo | Roda a verificação de tipos e devolve os erros ao agente |
| `antes-do-commit.cjs` | Antes de um comando `git commit` | Bloqueia o commit se o projeto não compilar ou se houver `console.log` novo |
| `.githooks/pre-commit` | Hook nativo do Git | A mesma checagem, para quem commita fora do agente |

O segundo é o hook atrelado a uma tarefa do Git. Ele respeita `--no-verify` para casos
excepcionais. O terceiro existe porque um hook que só funciona dentro do agente é hábito pessoal;
em `.githooks/`, vira regra do projeto — basta ativar uma vez por clone com
`git config core.hooksPath .githooks`.

**Resultado alcançado.** Os dois hooks do agente foram testados nos dois caminhos antes de serem
versionados: com o código limpo (passam em silêncio) e com um defeito inserido de propósito e
depois revertido (bloqueiam com a mensagem correta). O hook de commit efetivamente barrou um
`console.log` de teste que colocamos no índice.

**Duas correções durante a construção**, que só apareceram porque testamos:

1. A primeira versão foi escrita em shell, usando `jq` para ler os dados de entrada. `jq` não está
   instalado na máquina de desenvolvimento. Reescrevemos em Node — que o projeto já exige — e
   passaram a funcionar igual no Git Bash, no PowerShell e no Linux.
2. A chamada ao compilador usava `npx`, o que gerava um aviso de depreciação em toda execução.
   Passamos a invocar o compilador local diretamente.

---

## 4. Os agentes utilizados

Além do agente principal, usamos subagentes — instâncias com escopo próprio, que trabalham em
paralelo e devolvem apenas a conclusão.

### 4.1 Agentes de exploração (3, em paralelo)

Antes de planejar qualquer coisa, três agentes percorreram o repositório com escopos diferentes e
devolveram um retrato do que existia, com caminho de arquivo e número de linha.

**Resultado:** revelaram quatro problemas estruturais que não estavam no enunciado das tarefas —
entre eles, que uma funcionalidade pedida como "ajuste de tela" exigia, na verdade, modelagem de
dados nova. Descobrir isso antes de começar evitou retrabalho.

### 4.2 Agente de planejamento (1)

Recebeu o resultado da exploração e desenhou a estratégia de implementação, avaliando alternativas
de modelagem antes de escolher.

### 4.3 Agente de desenvolvimento (1) — tarefa delegada

Delegamos uma unidade fechada de trabalho: eliminar uma constante de cores duplicada literalmente
em três arquivos, substituindo-a por uma função única.

A tarefa foi escolhida por ter as três características que tornam uma delegação viável: **escopo
fechado** (três arquivos nomeados), **critério de sucesso objetivo** (compilar e construir sem
erro) e **resultado verificável sem julgamento subjetivo** (a aparência não podia mudar).

No prompt, além do objetivo, incluímos **uma armadilha nomeada antecipadamente**: um import podia
ou não ficar sem uso após a mudança, dependendo do arquivo, e isso precisava ser conferido caso a
caso. Foi o detalhe que mais rendeu — é exatamente o tipo de coisa que gera erro silencioso.

**Resultado:** o agente concluiu em uma passagem, sem correção de rumo, e verificou o próprio
trabalho. Conferimos de forma independente e estava correto. Ainda assim, **ajustamos um ponto**:
ele usou uma solução que enfraquece a checagem de tipos para contornar um detalhe de escopo.
Registramos como aprendizado — revisar a entrega do agente continua necessário **mesmo quando ela
passa em todos os critérios objetivos**.

### 4.4 Agente revisor (1) — criado por nós

Definimos um subagente especializado nas regras deste projeto
(`.claude/agents/revisor-gtporte.md`), focado no que o compilador não vê: funções de banco que
ignoram as regras de acesso, componentes reimplementados à mão, cores fora da paleta e divergência
entre listas mantidas em dois lugares.

A escolha do escopo foi deliberada — um revisor genérico repetiria o que a verificação de tipos já
faz.

**Resultado, e foi o mais relevante de toda a automação:** o revisor analisou a entrega inteira e
encontrou **onze problemas, quatro deles graves**, com a verificação de tipos passando limpa. Os
principais:

- **Dados pessoais expostos.** Acrescentamos CPF, RG e endereço a uma tabela cuja regra de leitura
  era "qualquer usuário autenticado" — regra escrita quando a tabela só tinha nome e telefone.
  Qualquer estudante passava a ler o CPF de toda a equipe de motoristas.
- **Auto-aprovação de documento.** Faltava validar um campo na regra de inserção, permitindo que o
  motorista aprovasse o próprio documento por chamada direta à API.
- **Função de banco contornando as regras de acesso**, desfazendo uma decisão de segurança tomada
  meses antes.
- **Indicadores da tela inicial zerados em silêncio**, por incompatibilidade entre a consulta usada
  e os campos esperados pela tela — sem nenhum erro de compilação.

Todos foram corrigidos.

**Uma limitação encontrada.** A definição do agente revisor é lida pelo Claude Code ao iniciar uma
sessão. Como a criamos no meio da sessão em andamento, ela ainda não estava registrada, e a
execução foi feita apontando um agente genérico para o arquivo de definição. O resultado foi o
mesmo, mas vale registrar: **agentes personalizados passam a valer a partir da próxima sessão**.

---

## 5. O que pode ser melhorado

### Na Skill

- **Executá-la.** É a pendência óbvia. O roteiro existe; a evidência de execução, não.
- **Saída legível por máquina.** Hoje devolve uma tabela em texto. Em JSON, daria para acompanhar a
  evolução dos itens entre execuções e detectar regressão.
- **Preparar os próprios dados.** A Skill exige que o usuário informe credenciais dos três perfis e
  que exista um estudante em condições específicas. Se ela mesma criasse esse cenário, rodaria
  sozinha.
- **Registrar evidência visual.** Capturar imagem de cada item reprovado transformaria o relatório
  em algo que a banca consegue conferir sem repetir o teste.
- **Reduzir o checklist.** 45 itens escritos à mão são conhecimento que envelhece junto com o
  código. Boa parte poderia virar teste automatizado; a Skill ficaria só com o que faz sentido
  verificar visualmente.

### Nos Hooks

- **Verificação incremental.** Hoje o hook roda a checagem do projeto inteiro a cada arquivo salvo,
  o que leva dezenas de segundos. Em edições em série, é tempo desperdiçado — deveria aguardar uma
  pausa antes de rodar, ou checar apenas o que mudou.
- **A busca por `console.log` é ingênua.** Usa expressão regular simples: não detecta variações com
  espaçamento diferente e sinalizaria uma linha comentada. Uma ferramenta de análise estática
  resolveria melhor.
- **O hook de commit não constrói o projeto.** Verifica tipos, mas não roda a construção — existem
  erros que só aparecem nessa etapa.
- **Ativação manual.** O hook nativo do Git exige um comando por clone. Poderia ser configurado
  automaticamente na instalação das dependências.
- **Falham em silêncio sem dependências.** Se as bibliotecas não estiverem instaladas, os hooks
  simplesmente não checam nada. Deveriam avisar, em vez de passar batido.
- **A limitação de fundo:** os hooks só conseguem verificar tipos porque **não existe suíte de
  testes**. Com testes, o mesmo mecanismo teria muito mais valor.

---

## 6. Aprendizados

**O agente rende mais em preparação e verificação do que em digitação.** As etapas que produziram
mais valor foram a exploração inicial — que revelou problemas não previstos — e a revisão final,
que encontrou falhas de segurança reais. Escrever o código foi a parte mais rápida e menos
arriscada.

**Automação só vale quando está versionada.** Um hook na máquina de um integrante é hábito pessoal.
No repositório, é regra do projeto.

**Ferramenta não verificada é aposta.** Escrever os hooks assumindo que `jq` estava instalado
custou uma reescrita completa. Testar antes de versionar foi o que revelou isso.

**Nomear as armadilhas melhora o resultado da delegação.** O que mais ajudou o agente de
desenvolvimento não foi descrever o objetivo, e sim apontar antecipadamente onde ele erraria, dar o
comando exato de verificação e declarar os limites.

**O limite do agente está no que ele consegue verificar, não no que sabe escrever.** Onde havia
critério objetivo — compila, constrói, aparência inalterada — o resultado foi confiável. Onde não
havia, continua dependendo de conferência humana.

**Revisar o que mudou não basta; é preciso revisar o que a mudança afetou.** As três falhas de
segurança mais graves eram invisíveis no comparativo de versões: em nenhuma delas o código errado
foi escrito nesta rodada. Acrescentamos campos a uma tabela cuja regra de acesso já existia — e a
regra, que não aparecia na comparação, deixou de ser adequada.

---

## Anexo · Arquivos da automação

```
.claude/
  settings.json                   configuração dos hooks
  agents/
    revisor-gtporte.md            agente revisor
  hooks/
    checar-tipos.cjs              verificação após cada edição
    antes-do-commit.cjs           portão antes do commit
  skills/
    testar-site/
      SKILL.md                    roteiro de verificação
      checklist.md                45 itens nos três painéis
.githooks/
  pre-commit                      mesma checagem fora do agente
```
