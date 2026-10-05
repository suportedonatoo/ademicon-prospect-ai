# Banco de dados

**PostgreSQL 16 + pgvector**, acessado via **Prisma 6**. Schema em `prisma/schema.prisma` (69 modelos), migrations em `prisma/migrations`.

## Convenções

- IDs `cuid()`; `createdAt`/`updatedAt` em todas as entidades mutáveis.
- `organizationId` em toda entidade de negócio + índices compostos começando por ele.
- Enums como `String` validados por Zod/catálogos (evita migrations para cada novo valor).
- JSON para configurações flexíveis (`Organization.settings`, `RoutingRule.conditions`, `Lead.signals`, `Simulator.config`).
- Embeddings em `KnowledgeChunk.embedding vector(256)` (`Unsupported` no Prisma, lido/escrito via SQL).

## Domínios e principais tabelas

| Domínio | Tabelas |
|---|---|
| Organização / acesso | Organization, User, Role, Permission, RolePermission, Session, ApiKey |
| Estrutura comercial | Region, PJ, Consultant |
| Leads | Lead, LeadIdentity, LeadSource, LeadMerge, LeadScore, LeadScoreEvent, LeadActivity, LeadMemory |
| CRM | Pipeline, PipelineStage, Opportunity, OpportunityActivity, Task |
| Aquisição | Campaign, CampaignAudience, CampaignMessage, CampaignEvent, CampaignMetric, LandingPage, LandingForm, Simulator, Simulation, ProspectSearch, BusinessProspect, ImportJob, ImportRow |
| Conversas / IA | Conversation, Message, ConversationSummary, AIAgent, AIPlaybook, AIExecution, AIEvent, AIFeedback, KnowledgeGap |
| Knowledge Base | KnowledgeCategory, KnowledgeDocument, KnowledgeVersion, KnowledgeChunk |
| WhatsApp | WhatsAppAccount, WhatsAppNumber, MessageTemplate |
| Attribution | AttributionSession, AttributionEvent |
| Distribuição | RoutingRule, RoutingState, RoutingDecision |
| Automação / integrações | AutomationRule, Notification, Integration, Webhook, WebhookSubscription, WebhookDelivery, DomainEvent |
| Auditoria / LGPD | AuditLog, Consent, CommunicationPreference, PrivacyEvent, DataRequest |

## Deduplicação

`LeadIdentity` guarda identificadores normalizados (`PHONE`, `EMAIL`, `CPF`, `CNPJ`) com unicidade por organização. Uma nova entrada que colide vira **merge**: `LeadMerge` registra `matchedBy`, `mergedAt`, `mergedBy`, `mergeReason`, e `LeadSource` preserva o histórico de todas as fontes. Leads de organizações diferentes nunca são mesclados.

## Opportunity separada do Lead

Um lead pode ter várias oportunidades. `Opportunity` tem etapa, valor, status (`OPEN`/`WON`/`LOST`), motivo de perda e `OpportunityActivity` com todo o histórico de etapas.

## Comandos

```bash
npm run db:up        # Postgres + Redis via Docker
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy (produção)
npm run db:seed      # dados de demonstração
npm run db:reset     # recria o banco (apaga tudo)
```

## Landing das PJs e canal de origem

- `PJ.subdomain` (único), `landingActive`, `landingTitle`, `landingSubtitle`, `landingSimulatorId`: landing própria da PJ.
- `Lead.landingHeat` (`MORNO` | `QUENTE`) e `Lead.originPjId`: qualificação feita na landing e PJ dona do lead.
- `Simulation.pjId`, `heat` (`FRIO` | `MORNO` | `QUENTE`), `channel`: simulações frias ficam sem lead e sem dado pessoal.
- `AttributionSession.channel` (`GOOGLE_ADS`, `GOOGLE_ORGANIC`, `META`, …) e `pjId`.

Veja [landing-service.md](landing-service.md).

## Pendências conhecidas

- Índice HNSW em `KnowledgeChunk.embedding`: não incluído porque o Prisma o detecta como drift. Com o volume atual a busca exata é suficiente; para produção com muitos documentos, criar via migration SQL dedicada (`CREATE INDEX … USING hnsw (embedding vector_cosine_ops)`) e marcá-la como aplicada.

## V2 — novas entidades

| Área | Tabelas |
|---|---|
| Lead / Revenue Intelligence | `BuyingSignal`, `IntentEvent`, `NextBestAction`, `DuplicateCandidate`, `LossRecord`; colunas novas em `Lead` (`fitScore`, `intentScore`, `engagementScore`, `behaviorScore`, `recencyScore`, `lifecycle`, `lastSignalAt`, `experimentVariantId`) e `Opportunity` (`health`, `healthScore`, `healthReasons`, `stageChangedAt`, `lastActivityAt`, `lostCategory`, `competitor`, `experimentVariantId`) |
| Playbooks, IA e experimentos | `PlaybookVersion`, `PlaybookRun`, `AIPromptVersion`, `AIEvalDataset`, `AIEvalCase`, `AIEvalRun`, `AIInsight`, `Experiment`, `ExperimentVariant`; colunas de custo/confiança em `AIExecution` |
| Plataforma | `FeatureFlag`, `SavedFilter`, `ConfigHistory`, `OutboxEvent`, `JobRun`, `WebhookAttempt`; `Webhook.idempotencyKey`; `Organization` (`legalName`, `logoUrl`, `timezone`, `locale`, `status`); `Consultant` (`maxOpenOpportunities`, `workingHours`); `KnowledgeDocument.validFrom` e ciclo de status |
| Notificações multi-dispositivo | `NotificationPreference`, `UserDevice`, `DeepLink`; colunas novas em `Notification` (`category`, `priority`, `entityType`, `entityId`, `dedupeKey`, `heldUntil`, `channels`, `deliveredAt`, `clickedAt`) |

Migration: `prisma/migrations/20260930120000_v2_revenue_intelligence_notifications` (somente aditiva, com backfill de `KnowledgeDocument.status ACTIVE → PUBLISHED` e dos tempos de etapa das oportunidades).
Índices novos: `Lead(organizationId, temperature|lifecycle)`, `Opportunity(organizationId, updatedAt|health)`, `Notification(userId, createdAt)`, `(organizationId, type, createdAt)` em sinais/intenções/eventos, `NextBestAction(organizationId, status, priority)` e outros.
