# Integrações

## Princípio

**Nenhuma API, endpoint, credencial ou regra foi inventada.** Toda integração externa segue o contrato `IntegrationProvider` e tem uma implementação **Mock** (dados fictícios, claramente marcados) para desenvolvimento e demonstração. A implementação real só é ativada com credenciais válidas via variáveis de ambiente, e integrações sem documentação oficial disponível ficam como **Placeholder** explícito.

Status de cada integração: tela **Integrações** (`/integracoes`), com modo (`mock`, `real`, `placeholder`), última sincronização e erros.

## Fontes de lead (AcquisitionEngine)

`POST /api/v1/acquisition/{source}` recebe o payload bruto da fonte; o `LeadSourceProvider` correspondente o converte em entrada padrão e o `LeadEngine` faz o resto.

| Fonte | Provider | Observação |
|---|---|---|
| `GOOGLE_ADS` | GoogleAdsProvider | Lead form / conversões. Mock até configurar `GOOGLE_ADS_*`. |
| `META`, `INSTAGRAM` | MetaProvider / InstagramProvider | Lead Ads. Mock até configurar `META_*`. |
| `WHATSAPP` | WhatsAppProvider | Quem inicia a conversa consente com resposta no mesmo canal (finalidade: atendimento). |
| `LANDING`, `SIMULATOR` | Landing / Simulator | Páginas públicas do próprio sistema. |
| `IMPORT` | CSVProvider | CSV/XLSX com relatório por linha. |
| `MAPS` | MapsProvider | Prospecção de empresas por fonte autorizada (ver abaixo). |
| `API`, `MANUAL` | ApiProvider / Manual | Integrações próprias e cadastro manual. |

## WhatsApp

- `WHATSAPP_PROVIDER=mock` (padrão) grava as mensagens sem enviá-las; `cloud-api` usa a API oficial com `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN`.
- Webhook de entrada: `GET/POST /api/v1/webhooks/inbound/whatsapp?org=<slug>` (verificação `hub.challenge` com `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- Envio proativo só com opt-in, fora do horário de silêncio, dentro do limite semanal e por **template aprovado**; fila com pausa e auditoria. Não há mecanismo para contornar limites, mascarar origem ou disparar em massa sem consentimento.

## Prospecção de empresas

Somente fontes autorizadas: `MapsProvider` (Google Maps / Bing Maps com chave própria) e `CompanyRegistryProvider` (API de dados cadastrais contratada). **Sem scraping** que viole termos de serviço. Empresas encontradas ficam em `BusinessProspect` e só viram lead por ação humana (`prospecting.convert`).

## Sistemas internos (Newcon, ComercialNet)

`src/modules/integrations/ademicon/ademicon.adapters.ts` contém **placeholders** (`NewconAdapter`, `ComercialNetAdapter`, `AdemiconProvider`) que respondem "Aguardando documentação oficial e credenciais autorizadas". Nenhuma tentativa de acesso é feita. Para implementar: obter documentação e credenciais oficiais, implementar o adapter e ativá-lo por configuração.

## Webhooks de saída

Cadastro em **Integrações → Webhooks** (`webhook.manage`), escolhendo os eventos do Event Bus.

- Requisição `POST` JSON com cabeçalhos `x-prospect-event`, `x-prospect-timestamp` e `x-prospect-signature: sha256=HMAC_SHA256(secret, "<timestamp>.<body>")`.
- Retry com backoff exponencial: 2, 4, 8, 16, 32, 60 minutos — até 6 tentativas. Histórico em `WebhookDelivery`.

Verificação no receptor (Node):

```js
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-prospect-signature']));
```

## API keys

Criadas em **Integrações → API** (`apikey.manage`). Formato `pk_…`, exibidas uma única vez, armazenadas apenas como hash. Uso: `Authorization: Bearer pk_…`, limitada às permissões escolhidas na criação; pode ser revogada a qualquer momento.

## Status das integrações (V2)

Tela **Integrações → Saúde da Operação** (`/saude`, `GET /api/v1/operations/health`): status, última verificação, latência do health check e último erro. Estados: **CONNECTED** (real, com credenciais), **MOCK** (demonstração, identificado), **NOT_CONFIGURED** (falta credencial/documentação oficial), **ERROR**, **DISABLED**.

| Integração | Status padrão | Provider | Credenciais | Documentação |
|---|---|---|---|---|
| IA (Claude) | MOCK | `AIProvider` (Anthropic / Mock) | `AI_PROVIDER=anthropic`, `AI_API_KEY`, `AI_MODEL` | docs/ai.md, docs/maestro.md |
| WhatsApp | MOCK | `WhatsAppProvider` (Cloud API / Mock) | `WHATSAPP_*`, `WHATSAPP_APP_SECRET` | Meta WhatsApp Business Platform |
| Google Ads | MOCK | `GoogleAdsProvider` | `GOOGLE_ADS_*` | Google Ads API |
| Meta / Instagram | MOCK | `MetaProvider` / `InstagramProvider` | `META_*` | Meta Marketing API |
| Google Maps / Bing Maps | MOCK | `MapsProvider` | `GOOGLE_MAPS_API_KEY`, `BING_MAPS_API_KEY` | APIs oficiais (sem scraping) |
| Dados cadastrais | MOCK | `CompanyRegistryProvider` | `COMPANY_REGISTRY_*` | API contratada |
| E-mail | NOT_CONFIGURED (ou MOCK com `EMAIL_PROVIDER=log`) | `EmailProvider` | provider (Gmail API / Microsoft Graph / SMTP) | — |
| Google Calendar / Microsoft Calendar | NOT_CONFIGURED | `CalendarProvider` | OAuth do usuário + app aprovado | — |
| Web Push | CONNECTED com VAPID | `webPushProvider` (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | docs/notifications.md |
| Ademicon (Newcon, ComercialNet) | NOT_CONFIGURED | `AdemiconProvider`, `NewconAdapter`, `ComercialNetAdapter` | aguardando documentação, credencial e autorização | — |

Nenhuma integração mock é apresentada como ativa.

## Webhooks — tentativas

Cada tentativa de entrega fica em `WebhookAttempt` (status HTTP, erro, duração). Webhooks **recebidos** têm idempotência (`provider:org:idExterno`): o mesmo evento duas vezes vira `DUPLICATE`.
