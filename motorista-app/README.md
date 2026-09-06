# GTPORTE Motorista (PWA)

App mobile para motoristas do sistema GTPORTE de Transporte Acadêmico.

## Funcionalidades

- **Viagem** — ver rota ativa, passageiros do dia (ida/volta), alterar situação (aguardando/em rota/concluída), rastreamento GPS em tempo real, aprovar/recusar solicitações de volta
- **Avisos** — enviar avisos para os passageiros da rota, excluir avisos
- **Mensagens** — enviar e receber mensagens do setor administrativo, marcar como lida
- **Perfil** — ver dados, rotas atribuídas, sair

## Instalação como PWA

O app é um Progressive Web App. Ao acessar pelo navegador do celular:
1. Clique em "Adicionar à tela inicial" (Android) ou "Compartilhar → Adicionar à Tela" (iOS)
2. O app aparecerá como um ícone nativo
3. Funciona offline para dados já carregados

## Dev

```bash
cd motorista-app
cp ../.env .env          # mesmas variáveis do projeto principal
npm install
npm run dev
```

## Build

```bash
npm run build            # gera /dist pronto para deploy
```
