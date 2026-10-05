# Vela Inbound: MVP de Prospecção Inbound (Consórcios & Crédito)

Protótipo funcional para validar o conceito. **Empresa, pessoas e números são fictícios.**
Não há integração real com WhatsApp, IA, API de crédito nem banco de dados. Tudo roda no navegador,
com dados salvos no `localStorage`.

## Como rodar

Requer Node 18 ou superior. Não há dependências para instalar.

No Windows, basta dar dois cliques em **`Iniciar.bat`**: ele sobe o servidor e abre o navegador. Para parar, feche a janela preta.
Pelo terminal:

```bash
npm start
```

- Landing page: http://localhost:3400/
- Plataforma (CRM): http://localhost:3400/app.html

## Contas de demonstração (senha `123456`)

| Perfil | E-mail |
|---|---|
| Gestor | gestor@teste.com |
| PJ 001 a PJ 005 | pj001@teste.com … pj005@teste.com |

As senhas ficam em texto puro **apenas nesta demo**. Veja "Próximos passos".

## Roteiro de demonstração

1. Na landing, preencha o simulador e escolha **Somente simular** (Lead Frio) ou **Tenho interesse** (Lead Qualificado).
2. O resultado mostra as parcelas e, em "Nos bastidores", as etapas: registro, score, classificação e distribuição Round Robin.
3. Clique no botão de chat: o **Chatbot 1** atende leads frios e o **Chatbot 2** faz o pré-atendimento e transfere para o PJ.
4. Abra o CRM (`app.html`) numa aba separada. Leads novos aparecem ao vivo, com um aviso.
5. Entre como **gestor** para ver o dashboard, o Kanban completo, a distribuição, a equipe e o WhatsApp.
6. Entre como **PJ** para ver somente os próprios leads.
7. Em **Distribuição**, use "Simular chegada de lead" para ver a fila Round Robin girar.
8. O botão "Restaurar dados de demonstração", na barra lateral do gestor, recarrega os 30 leads fictícios.

## Regras implementadas

**Lead Score** (`src/services/scoring.js`): cadastro +10, valor +10, renda +10, "Tenho interesse" +30,
WhatsApp +10, e-mail +10, respondeu o chatbot +20. Faixas: 0–30 Frio · 31–60 Morno · 61–100 Qualificado.

**Classificação:** "Tenho interesse" leva o lead para Qualificado e ele é distribuído na hora.
"Somente simular" leva para Lead Frio, e o lead vai para nutrição pelo Chatbot 1.

**Distribuição** (`src/services/distribution.js`): Round Robin PJ 001 → 002 → 003 → 004 → 005 → 001…
Ao mover um lead sem responsável para uma etapa que exige PJ (Distribuído, Em atendimento etc.), ele é distribuído automaticamente.
O gestor também pode atribuir manualmente.

## Arquitetura

```
server.js                 servidor estático (sem dependências)
index.html / app.html     landing page / plataforma
assets/css/               estilos (landing, app, chat)
src/config.js             providers trocáveis (dados, WhatsApp, IA, API de crédito)
src/data/                 catálogos (etapas, produtos, rendas) e dados fictícios
src/services/             regras de negócio: leads, score, distribuição, auth, chatbot, WhatsApp, notificações
  storage.js              adaptador de persistência (localStorage hoje, ApiAdapter depois)
src/integrations/         contratos das integrações futuras (creditApi, whatsapp, ai)
src/ui/                   telas (views/) e componentes (chat, gráficos, modal, Kanban)
```

As telas só conversam com `src/services/*`, então trocar a fonte de dados não mexe na interface.

## Próximos passos (fora do MVP)

- **Banco real e API:** implementar `ApiAdapter` em `storage.js` com um backend (Node/Postgres, por exemplo) e mudar `dataProvider` para `'api'`.
  Os serviços hoje são síncronos; no backend passam a ser `async`.
- **Autenticação:** hash de senha, JWT ou sessão, e permissões vindas do servidor (o mapa `PERMISSIONS` em `auth.js` já centraliza os papéis).
- **70 PJs:** cadastro em lote e convites. A distribuição já funciona com qualquer quantidade de PJs.
- **WhatsApp Business API:** implementar `src/integrations/whatsapp.js` no backend (tokens nunca no navegador) e usar webhooks.
- **IA real:** implementar `src/integrations/ai.js` no backend, mantendo o formato de resposta do motor de chat.
- **API da empresa de crédito:** trocar o cálculo ilustrativo de `src/integrations/creditApi.js` pela chamada real.
- **Notificações e analytics:** `services/notifications.js` é o ponto único de envio (push, e-mail, WhatsApp).
