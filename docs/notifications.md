# Notificações, tempo real, mobile e extensão

## Arquitetura

```
Evento de domínio ──► NotificationCenter (notification.service.ts)
                        │ preferência do usuário (categoria × canal)
                        │ horário de silêncio (retém não críticos)
                        │ dedupeKey (sem duplicatas)
                        ▼
                   Notification (IN_APP — registro auditável)
                        │
        ┌───────────────┼───────────────────┬──────────────────┐
        ▼               ▼                   ▼                  ▼
  SSE /realtime   Notificação DESKTOP   Web Push (fila       E-mail
  (sino, inbox)   (Notification API)    push.send · VAPID)   (provider)
        │                                   │
        └────────► Extensão (alarme 1 min, token de dispositivo)
```

Todo clique (sino, desktop, push, extensão, central) passa por `GET /api/v1/notifications/:id/open?via=…`, que marca **lida + clicada** (métricas) e redireciona **só para caminho interno** (sem open redirect). Sem sessão → login → volta ao recurso.

## Canais

| Canal | Como funciona | Requisito |
|---|---|---|
| Sino (IN_APP) | Sempre registrado | — |
| Computador | Notification API do navegador, disparada pelo evento SSE | Permissão do navegador (Notificações e dispositivos → Ativar) |
| Celular / navegador fechado | **Web Push** (VAPID) + Service Worker `/sw.js` | `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; no iPhone (iOS 16.4+) instalar como app (Adicionar à Tela de Início) |
| Extensão | Consulta `/api/v1/extension/summary` a cada minuto | Token de dispositivo |
| E-mail | `EmailProvider` | Provider configurado (`EMAIL_PROVIDER=log` em dev apenas registra) |

Sem configuração, o canal fica **NOT_CONFIGURED** (Saúde da Operação) — nada é simulado.

## Preferências e silêncio

`NotificationPreference`: matriz **categoria × canal** (lead quente, qualificado, morno, frio; nova mensagem, pediu consultor, transferência, SLA; oportunidade, tarefa, integração, erro crítico), horário de silêncio (ex.: 22:00–07:00, fuso da organização) e "ocultar detalhes na tela bloqueada".
Durante o silêncio, notificações não críticas ficam retidas (`heldUntil`) e são liberadas pelo job `notifications.release`. **Sempre passam**: lead quente, SLA crítico, erro crítico e prioridade CRITICAL.

## Tela bloqueada

Com "ocultar detalhes" (padrão), o push mostra só o tipo ("💬 Nova mensagem de cliente") — sem nome, telefone ou valores.

## Enviar para meu celular

`POST /api/v1/send-to-phone` `{ targetType: CONVERSATION|LEAD|OPPORTUNITY|TASK, targetId, method: QR|LINK|PUSH, deviceId? }`

1. Verifica permissão e escopo do recurso.
2. Gera código aleatório (16 caracteres) — **o banco guarda só o hash**; expira em `DEEP_LINK_TTL_MINUTES` (10).
3. QR/Link: `https://<app>/m/<código>` · Push: envia ao celular escolhido.
4. `/m/<código>`: exige login **do mesmo usuário e organização**; outro usuário (mesmo logado) recebe 403; expirado → aviso. A sessão do computador **nunca** é transferida. Uso auditado (`deep_link.created` / `deep_link.used`).

## Dispositivos

`UserDevice` (BROWSER, PWA, MOBILE, EXTENSION): rótulo, SO, navegador, último acesso, status. Revogar remove a inscrição push / invalida o token da extensão imediatamente. "Encerrar outras sessões" apaga as demais sessões web do usuário. Endpoints push expirados (404/410) são revogados automaticamente.

## Extensão "Ademicon Sales Assistant" (Chrome/Edge, MV3)

Código em `apps/extension/src`. Gerar: `npm run extension:build` → `apps/extension/dist`.

Instalação (desenvolvimento): `chrome://extensions` ou `edge://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → `apps/extension/dist`.
Conexão: plataforma → Notificações e dispositivos → **Conectar extensão** → copiar token → colar na extensão junto com o endereço. A extensão pede permissão **apenas** para esse domínio.

Segurança: token `dx_…` exclusivo do dispositivo (hash no banco), revogável; a API aceita esse token só em rotas marcadas `device: true` (leitura rápida: notificações, busca, NBA, resumo); cliques abrem a plataforma (login normal).

Publicação: empacotar a pasta `dist` e publicar na Chrome Web Store / Microsoft Edge Add-ons pela conta de desenvolvedor da empresa.

## Ativar no celular

- **Android (Chrome)**: abrir a plataforma → menu do usuário → Notificações e dispositivos → **Ativar push aqui**.
- **iPhone (iOS 16.4+)**: Safari → Compartilhar → **Adicionar à Tela de Início** → abrir pelo ícone → Ativar push aqui.

## Métricas (Notification Intelligence)

Central de notificações: entregues, abertura (lidas), clique e **ação após clique** (atividade do usuário no lead até 2h depois), tempo médio até a ação, push enviados/falhos.

## Testes

Integração (`tests/integration/v2.test.ts`): dedupe, silêncio com exceções, clique sem open redirect, notificação de outro usuário, deep link (sem login, outro usuário, outro tenant, expirado), token de extensão (escopo e revogação). A entrega real de push depende de navegador e das chaves VAPID — ver `docs/troubleshooting.md` para validar manualmente.
