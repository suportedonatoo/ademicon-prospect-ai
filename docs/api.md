# API

API REST versionada em **`/api/v1`**. Especificação **OpenAPI 3.1** em `GET /api/v1/openapi.json`, com visualização em **`/api-docs`**.

## Autenticação

| Uso | Como |
|---|---|
| UI | Cookie de sessão `pa_session` (via `POST /api/v1/auth/login`). Métodos de escrita exigem `Origin` do próprio domínio. |
| Integrações | `Authorization: Bearer pk_…` (API key criada em **Integrações → API**). |
| Público | Rotas `/api/v1/public/*` e webhooks de entrada — sem autenticação, com rate limit por IP. |

## Convenções

- Sucesso: `{ "data": … }`. Listas paginadas: `{ "data": { "items": [...], "total", "page", "pageSize" } }`.
- Erro: `{ "error": { "code", "message", "details?" } }` com status `400` (validação), `401`, `403` (permissão/CSRF), `404` (inclusive recurso de outro tenant), `409`, `429` (rate limit), `500`.
- Filtros por query string (`?q=`, `?status=`, `?period=7d|30d|90d|custom&from=&to=`, `?pjId=`, `?source=` …).
- Datas em ISO 8601 (UTC); valores monetários em reais (número).

## Principais recursos

| Recurso | Endpoints |
|---|---|
| Autenticação | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Leads | `GET/POST /leads`, `GET/PATCH/DELETE /leads/{id}`, `POST /leads/{id}/status`, `/assign`, `/notes`, `/consent`, `PUT /preferences`, `GET/POST /score`, `GET /intelligence`, `GET /leads/export` |
| Aquisição | `POST /acquisition/{source}` (GOOGLE_ADS, META, INSTAGRAM, WHATSAPP, LANDING, SIMULATOR, IMPORT, MAPS, API, MANUAL) |
| Importação | `GET/POST /imports`, `POST /imports/{id}/validate`, `POST /imports/{id}/execute`, `GET /imports/sample` |
| CRM | `GET/POST /opportunities`, `GET/PATCH /opportunities/{id}` (mudança de etapa via `stageKey`), `GET /pipelines`, `GET/POST /tasks`, `PATCH /tasks/{id}` |
| Conversas | `GET /conversations`, `GET /conversations/{id}`, `GET/POST /conversations/{id}/messages`, `POST /takeover`, `POST /return` |
| IA | `/ai/agents`, `/ai/playbooks`, `/ai/settings`, `/ai/executions` (+ `/feedback`), `/ai/gaps`, `POST /ai/maestro` |
| Knowledge Base | `GET/POST /knowledge`, `GET/PATCH /knowledge/{id}`, `POST /knowledge/{id}/status`, `GET /knowledge/search` |
| Marketing | `/campaigns` (+ `/status`, `/sync`, `/messages`), `/landing-pages` (+ `/status`), `/simulators` |
| WhatsApp | `/whatsapp/numbers`, `/whatsapp/templates`, `GET/POST /webhooks/inbound/whatsapp` |
| Distribuição | `/routing/rules`, `GET /routing/decisions`, `/pjs`, `/consultants`, `/regions` |
| Inteligência | `GET /analytics?view=dashboard|performance|stages|marketing|commercial|management|roi|ai`, `GET /attribution` |
| Administração | `/users`, `/roles` (+ `PUT /roles/{id}/permissions`), `/settings`, `/apikeys`, `/webhooks`, `/automations`, `/audit`, `/privacy` (+ `/requests`), `/notifications`, `/integrations`, `/prospecting` |
| Público | `POST /public/track`, `POST /public/simulations`, `POST /public/chat` |
| Operação | `GET /health` |

## Exemplo — enviar lead de um sistema próprio

```bash
curl -X POST http://localhost:3500/api/v1/acquisition/API \
  -H "Authorization: Bearer pk_xxx" -H "Content-Type: application/json" \
  -d '{"name":"Maria Souza","phone":"11999990000","product":"IMOVEL","desiredValue":350000,"city":"Jundiaí","uf":"SP"}'
```

Resposta: `{ "data": { "leadId": "…", "deduplicated": false, … } }`. O lead segue o fluxo completo (score, distribuição, eventos, webhooks).

## Versionamento

Mudanças incompatíveis só em `/api/v2`. Campos novos podem ser adicionados em `/v1` sem aviso — clientes devem ignorar campos desconhecidos.

## V2 — novos recursos

| Recurso | Endpoints |
|---|---|
| Lead Intelligence | `GET /leads/{id}/dna`, `POST /leads/{id}/intelligence/refresh`, `GET /leads/{id}/journey`, `GET /nba`, `PATCH /nba/{id}` |
| Duplicidades | `GET/POST /duplicates` (lista / varrer), `POST /duplicates/{id}` (`MERGE` com `keepId` · `KEEP_BOTH` · `IGNORE`) |
| Revenue Intelligence | `GET /revenue?view=funnel|by|campaigns|products|losses|ai|commercial&dim=…` |
| Operação | `GET /cockpit`, `GET /recovery`, `POST /recovery`, `GET /operations/health`, `GET /operations/capacity`, `GET /coach` |
| Oportunidades | `GET /opportunities/{id}/intelligence`; `PATCH /opportunities/{id}` aceita `lostCategory` e `competitor` |
| Insights | `GET/POST /insights`, `PATCH /insights/{id}` |
| Playbooks comerciais | `GET/POST /playbooks`, `GET /playbooks/{key}`, `POST /playbooks/{key}/status` |
| IA | `GET/POST /ai/prompts`, `POST /ai/prompts/{id}/status`, `POST /ai/lab`, `GET/POST /ai/evals`, `POST /ai/evals/{id}/cases`, `GET /ai/control-center`, `POST /copilot` |
| Conversas | `POST /conversations/{id}/control` (`take|pause|resume|close|reopen|transfer`), `GET /conversations/{id}/battlecard` |
| Busca | `GET /search?q=` (Ctrl+K) |
| Experimentos | `GET/POST /experiments`, `GET/POST /experiments/{id}` |
| Flags e histórico | `GET/PATCH /flags`, `GET /config-history`, `GET/POST/DELETE /saved-filters` |
| Notificações | `GET /notifications?status&category&priority&cursor`, `POST /notifications`, `POST /notifications/{id}/read`, `GET /notifications/{id}/open`, `GET/PUT /notifications/preferences`, `GET /notifications/metrics` |
| Tempo real | `GET /realtime/stream` (Server-Sent Events) |
| Dispositivos | `GET /devices`, `POST /devices/push`, `POST /devices/extension`, `DELETE /devices/{id}`, `DELETE /devices/sessions`, `POST /send-to-phone` |
| Extensão | `GET /extension/summary` |

### Autenticação da extensão

`Authorization: Device dx_…` — aceito **apenas** nas rotas marcadas para dispositivo (notificações, busca, NBA, resumo). Demais rotas respondem 403.

### Rastreio

Toda resposta traz `x-request-id` e `x-trace-id` (usa o `traceparent` recebido, se houver). Erro 500 devolve `errorId` para localizar o log.

## Fechamento V2 — idempotência, produtos e relatórios

**Idempotency-Key** (opcional) em `POST /leads`, `/opportunities`, `/tasks`, `/acquisition/{source}`, `/conversations/{id}/messages` e `/products`:
a mesma chave com o mesmo corpo devolve a resposta original (cabeçalho `idempotent-replayed: true`) sem criar duplicado;
mesma chave com outro corpo → `422`; requisição ainda em andamento → `409`. Chaves valem 24 h e são isoladas por organização e rota.

| Recurso | Endpoints |
|---|---|
| Catálogo de produtos | `GET/POST /products`, `PATCH /products/{id}` (o código do produto é fixo depois de criado) |
| Relatórios | `GET /reports?entity=LEADS|OPPORTUNITIES&columns=&groupBy=&period=`, `GET /reports/export?format=csv|xlsx` (exige `lead.export`, auditado) |
