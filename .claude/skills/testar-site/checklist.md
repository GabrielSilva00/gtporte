# Checklist de verificação do GTPorte

Ordem importa: o painel do estudante e o do motorista consomem dados
criados no administrativo.

## 0. Acesso

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| 0.1 | Tela de entrada | Abrir `/login` | Foto do transporte à esquerda ocupando a maior parte da tela; formulário estreito à direita. Não deve aparecer "Setor de Transporte · Araçatuba" nem "Sua rota, presença e documentos." |
| 0.2 | Link do estudante | Abrir `/login?publico=estudante` | Entra já no público estudante, campo pede e-mail |
| 0.3 | Link do motorista | Abrir `/login?publico=motorista` | Faixa "Acesso do motorista", campo pede login |
| 0.4 | Login administrativo | Entrar com o usuário admin | Cai na Visão geral |

## 1. Painel administrativo

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| 1.1 | Visão geral | Olhar o cabeçalho | **Não** existe botão "Executar alocação" |
| 1.2 | Ocupação do dia | Card de ocupação | Título "Ocupação do dia" com pílulas Hoje / Dia anterior; trocar recarrega os números |
| 1.3 | Veículos | Abrir Veículos | Busca por placa e pílulas Todos / Disponível / Em rota / Manutenção, com contadores que batem com a lista |
| 1.4 | Estudantes — prontuário | Abrir um estudante | Prontuário é o **primeiro** campo, somente leitura |
| 1.5 | Estudantes — foto | Escolher uma imagem e salvar | Reabrir o cadastro mostra a foto |
| 1.6 | Motoristas — abas | Novo motorista | Nome, CNH e situação fora das abas; sete abas; aba Documentos desabilitada em cadastro novo |
| 1.7 | Motoristas — mínimo | Preencher só nome e CNH e salvar | Salva sem reclamar dos demais campos |
| 1.8 | Motoristas — filtro | Lista de motoristas | Pílulas por situação com contadores; busca por nome/CNH/CPF |
| 1.9 | Universidades — endereço | Abrir uma universidade | Campos de logradouro, número, bairro, complemento e CEP |
| 1.10 | Universidades — cores | Mesmo modal | 16 cores; a selecionada mostra o "check" |
| 1.11 | Universidades — cidades | Coluna da direita | Lista rola sozinha, não empurra a página |
| 1.12 | Documentos — titular | Abrir Documentos | Pílulas Estudantes / Motoristas no topo; trocar muda a fila |
| 1.13 | Documentos — cards | Selecionar alguém com documento | Cards menores, até 4 por linha |
| 1.14 | Funcionários — acessos | Linha de um operador | Botão "Acessos" abre modal só de permissões, com liberar/bloquear tudo |
| 1.15 | Relatórios — catálogo | Abrir Relatórios | 10 relatórios agrupados em Operação, Cadastros e Auditoria |
| 1.16 | Relatórios — filtros | "Filtrar e gerar" em Ocupação | Só aparecem rota, veículo e motorista — **não** os seis campos antigos |
| 1.17 | Relatórios — horário de aula | Cadastro de estudantes → filtrar | Bloco "Horário de aula" com dia e faixa; gerar traz só quem sai naquela janela |
| 1.18 | Relatórios — exportação | Exportar um em PDF e outro em Excel | Arquivo baixa com nome `gtporte_<relatorio>_<data>` e sem acento corrompido |
| 1.19 | Configurações — abas | Abrir Configurações | Geral, Organização, Acessos, Mensagens prontas, Alertas, Minha conta |
| 1.20 | Organização | Aba Organização | Índice lateral com 13 blocos; cada um tem "Salvar bloco" próprio e indicador de preenchimento |
| 1.21 | Organização — salvar | Preencher razão social e salvar o bloco | Recarregar mantém o valor; os outros blocos não são afetados |
| 1.22 | Acessos | Aba Acessos | Três links com botão copiar; copiar coloca a URL na área de transferência |
| 1.23 | Alertas | Aba Alertas | Três grupos: operação, vencimentos e regras de negócio |
| 1.24 | Mensagens prontas | Aba Mensagens prontas | Busca, filtro automáticas/manuais, duplicar e prévia com variáveis substituídas |
| 1.25 | Solicitações e Mensagens | Abrir as duas telas | Conversas de exemplo aparecem (dependem da migration 0013) |

## 2. Painel do estudante

Use um estudante com perfil **ida e volta**, documentação aprovada e rota
atribuída — sem isso metade dos itens não tem como acontecer.

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| 2.1 | Minha rota | Abrir `/estudante` | Rota, motorista, veículo e horários |
| 2.2 | Volta exige justificativa | Sem confirmar a ida, clicar em "Embarque de volta" | Abre modal de justificativa; o botão diz "Justificar", não "Confirmar" |
| 2.3 | Mínimo de caracteres | Digitar menos de 10 caracteres | Botão de enviar continua desabilitado |
| 2.4 | Envio | Escrever uma justificativa real e enviar | Card "Solicitação de volta avulsa" com selo "Aguardando o motorista" |
| 2.5 | Ida normal | Confirmar "Embarque de ida" | Vira confirmado, com o horário |
| 2.6 | Meus documentos | Abrir a tela | Quatro tipos, com o motivo da rejeição quando houver |

## 3. Painel do motorista

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| 3.1 | Menu | Entrar no painel | Passageiros, Minhas rotas, Solicitações, Meus documentos, Avisos, Mensagens |
| 3.2 | Fila de solicitações | Abrir Solicitações | O pedido de 2.4 aparece em "Aguardando decisão" |
| 3.3 | Recusa exige motivo | Clicar em Recusar sem preencher | Botão de confirmar continua desabilitado |
| 3.4 | Recusa | Recusar com motivo | Sai de pendente; o aluno passa a ver o motivo |
| 3.5 | Reenvio | Como aluno, "Enviar nova justificativa" | Volta a pendente para o motorista |
| 3.6 | Aprovação | Como motorista, Aceitar embarque | A volta do aluno aparece confirmada em Minha rota |
| 3.7 | Passageiros | Abrir Passageiros | Coluna Volta mostra o selo da solicitação |
| 3.8 | Documentos do motorista | Enviar um arquivo com validade | Aparece como pendente; o admin vê na fila de Motoristas |

## 4. Regressão que mais importa

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| 4.1 | Balcão continua livre | Como admin, em Presença, marcar a volta de um aluno **sem** ida confirmada | Marca direto, **sem** exigir justificativa — o fluxo novo vale só para o aluno |
| 4.2 | Presença mostra a solicitação | Mesma tela | Selo da solicitação na coluna Volta, com justificativa e motivo da recusa |
| 4.3 | Indicador | Cabeçalho de Presença | "Voltas a decidir" conta as pendentes |

> 4.1 é a regressão mais provável de toda a entrega: `confirmar_presenca`
> foi reescrita na migration `0012` e o caminho do staff precisou ser
> preservado intacto. Se algum item merece atenção redobrada, é este.
