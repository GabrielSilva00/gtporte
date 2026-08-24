---
name: testar-site
description: Roteiro de teste ponta a ponta do GTPorte no navegador. Sobe o servidor de desenvolvimento, percorre os três painéis (administrativo, estudante e motorista), lê o console em busca de erros e devolve uma tabela de aprovado/reprovado por item. Use quando pedirem para testar o site, validar uma tela, conferir se uma mudança funciona no navegador, ou antes de entregar uma sprint.
---

# Testar o GTPorte no navegador

Roteiro de verificação do sistema rodando de verdade. O projeto não tem
suíte automatizada — o `tsc --noEmit` garante que compila, não que
funciona. Esta skill cobre a diferença.

## Antes de começar

1. **Confirme que compila.** `npm run lint` e depois `npm run build`. Se
   qualquer um falhar, pare e relate: não adianta testar tela com o
   projeto quebrado.

2. **Confirme que as migrations foram aplicadas.** Muitas telas dependem
   das migrations `0008`–`0013`. Rode a consulta abaixo pelo painel do
   Supabase, ou peça ao usuário que rode:

   ```sql
   select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('organizacao','documento_motorista','solicitacao_volta');
   ```

   Faltando alguma, avise o usuário e **não marque os itens dependentes
   como reprovados** — marque como *bloqueado*, que é diferente.

3. **Suba o servidor** em segundo plano: `npm run dev`
   (`run_in_background: true`). Ele serve em `http://localhost:5173`.
   Ao terminar o roteiro, encerre o processo.

## Como percorrer

Use as ferramentas `mcp__claude-in-chrome__*`. Carregue-as em **uma única**
chamada de `ToolSearch`, e comece por `tabs_context_mcp` para ver o que já
está aberto. Abra uma aba nova em vez de reaproveitar a do usuário.

Peça as credenciais dos três perfis ao usuário no início — sem elas o
roteiro para no login. Não invente usuário nem senha.

O checklist item a item está em `checklist.md`, ao lado deste arquivo.
Leia-o e siga na ordem: os painéis do estudante e do motorista dependem
de dados criados no painel administrativo.

## Regras de execução

- **Não dispare diálogos do navegador** (`alert`, `confirm`, `prompt`).
  Eles travam a extensão e derrubam o resto do roteiro. Na dúvida sobre
  um botão destrutivo, pule o item e registre o motivo.
- **Leia o console depois de cada painel**, com
  `read_console_messages` filtrando por `error|Error|Failed`. Erro de
  rede 4xx do Supabase quase sempre significa migration faltando ou RLS
  barrando — registre o código e a tabela.
- **Duas tentativas por item.** Falhou duas vezes, marque como reprovado,
  anote o que aconteceu e siga. Não fique insistindo no mesmo botão.
- **Não conserte o código no meio do teste.** O objetivo é medir o
  estado atual. Junte os defeitos e reporte no fim.

## O que entregar

Uma tabela, um item por linha:

| Painel | Item | Resultado | Observação |
|---|---|---|---|

Resultado é `✅ passou`, `❌ falhou` ou `⏸ bloqueado`. Em falha, a
observação precisa dizer **o que foi feito, o que era esperado e o que
aconteceu** — "não funcionou" não serve.

Depois da tabela, um resumo curto: quantos passaram, quais defeitos
merecem correção imediata, e o que ficou bloqueado por dependência de
banco.
