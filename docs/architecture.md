# Arquitetura

## Visão geral

Monólito modular em **Next.js 15 (App Router) + TypeScript**, organizado por domínio. Uma única base de código serve:

- **UI administrativa** (`src/app/(app)/**`) — server components para leitura, client components para interação.
- **Páginas públicas** (`/landing/[slug]`, `/simulador/[slug]`) — landing pages, simulador e chat web.
- **API versionada** (`/api/v1/**`) — usada pela UI, pelas páginas públicas e por integrações externas (API key).
- **Worker** (`src/worker.ts`) — consome filas BullMQ (Redis) quando `QUEUE_DRIVER=bullmq`.

```
Browser ─┬─ UI (RSC + client) ──┐
         └─ Landing/Simulador ──┤
Integrações (API key, webhooks) ┤
                                ▼
                    /api/v1  (authed / publicRoute)
                                │  Ctx (org, usuário, perfil, escopo, permissões)
                                ▼
                     src/modules/<domínio>/*.service.ts
                      │        │           │
                   Prisma   Event Bus    Queue (inline | BullMQ)
                      │        │           │
                  Postgres  subscribers  worker → jobs/handlers.ts
                 (+pgvector) (webhooks, automações, notificações)
```

## Camadas

| Camada | Local | Responsabilidade |
|---|---|---|
| Rotas | `src/app/api/v1/**/route.ts` | Parse de entrada, autenticação (`authed`), rate limit, CSRF; delegam a serviços. |
| Serviços | `src/modules/*/*.service.ts` | Regra de negócio, checagem de permissão (`assertCan`), escopo de dados, auditoria. |
| Engines puras | `*-engine.ts` (scoring, routing, simulador, state machine, supervisor) | Lógica determinística sem banco — testada em `tests/unit`. |
| Providers | `src/modules/integrations/**`, `src/modules/ai/providers/**` | Contratos + implementações Mock/Real. Trocados por variável de ambiente. |
| Infra | `src/lib/**` | Prisma, Redis, filas, eventos, logger com redação, erros, rate limit, OpenAPI. |

## Multi-tenancy e escopo

Toda entidade de negócio tem `organizationId`. Cada requisição resolve um `Ctx`:

```ts
{ orgId, userId, roleKey, scope: 'ORG' | 'PJ' | 'OWN', permissions, pjId, consultantId, via: 'session' | 'apikey' | 'system' | 'public' }
```

Os helpers `leadScope`, `opportunityScope`, `conversationScope` e `taskScope` aplicam **tenant + escopo** em todas as consultas: consultor vê só o que é seu, gestor de PJ só a sua PJ, perfis ORG veem a organização inteira. Não há consulta de negócio sem `organizationId`.

## Fluxo principal

```
Fonte (Google Ads, Meta, Landing, Simulador, WhatsApp, Importação, API…)
 → AcquisitionEngine / LeadEngine.ingestLead
 → validação → normalização → deduplicação (LeadIdentity) → enriquecimento
 → LeadScoringEngine (explicável) → LeadRoutingEngine (regra → PJ → consultor)
 → Maestro (Prospect / Qualification Agent) → AI Sales Supervisor → handoff com resumo
 → Opportunity (pipeline de 10 etapas) → Attribution / Analytics / ROI
```

## Estados do lead

`NEW → PROCESSING → QUALIFIED → ASSIGNED → IN_CONVERSATION → OPPORTUNITY → CONVERTED`, com `LOST` e `BLOCKED` como saídas. Transições válidas em `src/modules/leads/state-machine.ts`; transições inválidas lançam erro.

## Event Bus

`publish(orgId, name, payload)` persiste um `DomainEvent` e notifica assinantes em processo (`src/modules/subscribers.ts`): notificações, automações, entregas de webhook e métricas. Eventos disponíveis em `src/lib/events.ts` (`lead.created`, `lead.assigned`, `conversation.handoff`, `opportunity.closed`, `consent.revoked`, …).

## Filas

`enqueue(job, data)` usa BullMQ quando `QUEUE_DRIVER=bullmq` (requer Redis e `npm run worker`) ou executa inline (dev/testes). Jobs (`src/jobs/handlers.ts`): `lead.process`, `ai.respond`, `webhook.deliver`, `knowledge.index`, `campaign.dispatch`, `followup.scan`, `whatsapp.reset_counters`.

## Observabilidade

- Logger estruturado JSON (`src/lib/logger.ts`) com redação de segredos e dados sensíveis.
- `GET /api/v1/health` — banco e Redis.
- Observabilidade de IA: `AIExecution`, `AIEvent`, `AIFeedback`, `KnowledgeGap` (tela **IA → Maestro**).
- Auditoria: `AuditLog` para ações sensíveis (exportações, permissões, handoff, LGPD).

## V2 — módulos adicionados

```
src/modules/
  lead-intelligence/   sub-scores, sinais, intenção, NBA, Lead DNA (intelligence-v2.service.ts)
  opportunities/       + health-engine (saúde/risco/perda) e opportunity-intelligence.service
  revenue/             Revenue / Campaign / Product / Loss Intelligence
  recovery/            Lead Recovery Center
  operations/          Capacity, Supervisor Cockpit, Operation Health
  sla/                 SLA Engine
  playbooks/           Playbooks comerciais versionados (engine + service)
  insights/            AI Insights por regra
  coach/               AI Sales Coach + Customer Journey
  copilot/             Copilot do consultor + Battlecard
  experiments/         A/B testing
  search/              Busca global (Ctrl+K)
  devices/             Dispositivos, extensão, "Enviar para meu celular"
  notifications/       NotificationCenter (preferências, silêncio, canais) + push.service (VAPID)
  ai/                  + prompt-versions, lab (AI Lab/Evaluation), confidence, cost
src/lib/realtime.ts    Hub SSE (memória ou Redis Pub/Sub)
src/lib/outbox.ts      Outbox pattern
apps/extension/        Extensão Chrome/Edge (MV3)
public/sw.js           Service Worker (Web Push) · public/manifest.webmanifest (PWA)
```

Detalhes: [lead-intelligence.md](lead-intelligence.md) · [revenue-intelligence.md](revenue-intelligence.md) · [notifications.md](notifications.md) · [maestro.md](maestro.md) · [events.md](events.md) · [queues.md](queues.md) · [troubleshooting.md](troubleshooting.md)
