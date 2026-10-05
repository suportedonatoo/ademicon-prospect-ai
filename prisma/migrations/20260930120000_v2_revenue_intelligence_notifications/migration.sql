-- AlterTable
ALTER TABLE "AIExecution" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "costMicros" INTEGER,
ADD COLUMN     "promptVersion" INTEGER,
ADD COLUMN     "requiresHuman" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "tokensInput" INTEGER,
ADD COLUMN     "tokensOutput" INTEGER;

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "maxOpenOpportunities" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "workingHours" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "KnowledgeDocument" ADD COLUMN     "validFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "behaviorScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "engagementScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "experimentVariantId" TEXT,
ADD COLUMN     "fitScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intentScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSignalAt" TIMESTAMP(3),
ADD COLUMN     "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "recencyScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "channels" TEXT[],
ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "heldUntil" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "competitor" TEXT,
ADD COLUMN     "experimentVariantId" TEXT,
ADD COLUMN     "health" TEXT,
ADD COLUMN     "healthReasons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "healthScore" INTEGER,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lostCategory" TEXT,
ADD COLUMN     "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'pt-BR',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "WebhookAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "responseStatus" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyingSignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyingSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextBestAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "action" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'RULE',
    "ownerType" TEXT,
    "ownerId" TEXT,
    "recommendedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NextBestAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadAId" TEXT NOT NULL,
    "leadBId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT,
    "competitor" TEXT,
    "stageKey" TEXT,
    "product" TEXT,
    "pjId" TEXT,
    "consultantId" TEXT,
    "campaignId" TEXT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LossRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playbookKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segment" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PlaybookVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playbookKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "leadId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "nextRunAt" TIMESTAMP(3),
    "log" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPromptVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "instructions" TEXT NOT NULL,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changeNote" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "AIPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvalDataset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIEvalDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvalCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],

    CONSTRAINT "AIEvalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvalRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "promptVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AIEvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sourceData" JSONB NOT NULL DEFAULT '{}',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'RULE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "target" TEXT NOT NULL,
    "targetId" TEXT,
    "campaignId" TEXT,
    "primaryMetric" TEXT NOT NULL DEFAULT 'OPPORTUNITIES',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "config" JSONB NOT NULL DEFAULT '{}',
    "exposures" INTEGER NOT NULL DEFAULT 0,
    "spend" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "job" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matrix" JSONB NOT NULL DEFAULT '{}',
    "quietEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStart" TEXT NOT NULL DEFAULT '22:00',
    "quietEnd" TEXT NOT NULL DEFAULT '07:00',
    "quietBypass" TEXT[] DEFAULT ARRAY['lead.hot', 'sla.critical', 'system.critical']::TEXT[],
    "hideSensitiveOnLockScreen" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "os" TEXT,
    "browser" TEXT,
    "pushEndpoint" TEXT,
    "pushP256dh" TEXT,
    "pushAuth" TEXT,
    "tokenHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeepLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByDevice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeepLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookAttempt_deliveryId_idx" ON "WebhookAttempt"("deliveryId");

-- CreateIndex
CREATE INDEX "BuyingSignal_organizationId_type_createdAt_idx" ON "BuyingSignal"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "BuyingSignal_leadId_createdAt_idx" ON "BuyingSignal"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "IntentEvent_organizationId_type_createdAt_idx" ON "IntentEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "IntentEvent_leadId_createdAt_idx" ON "IntentEvent"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "NextBestAction_organizationId_status_priority_idx" ON "NextBestAction"("organizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "NextBestAction_leadId_status_idx" ON "NextBestAction"("leadId", "status");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_organizationId_status_level_idx" ON "DuplicateCandidate"("organizationId", "status", "level");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_organizationId_leadAId_leadBId_key" ON "DuplicateCandidate"("organizationId", "leadAId", "leadBId");

-- CreateIndex
CREATE UNIQUE INDEX "LossRecord_opportunityId_key" ON "LossRecord"("opportunityId");

-- CreateIndex
CREATE INDEX "LossRecord_organizationId_category_createdAt_idx" ON "LossRecord"("organizationId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybookVersion_organizationId_status_idx" ON "PlaybookVersion"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookVersion_organizationId_playbookKey_version_key" ON "PlaybookVersion"("organizationId", "playbookKey", "version");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_status_nextRunAt_idx" ON "PlaybookRun"("organizationId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "PlaybookRun_leadId_idx" ON "PlaybookRun"("leadId");

-- CreateIndex
CREATE INDEX "AIPromptVersion_organizationId_agentKey_status_idx" ON "AIPromptVersion"("organizationId", "agentKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIPromptVersion_organizationId_agentKey_version_key" ON "AIPromptVersion"("organizationId", "agentKey", "version");

-- CreateIndex
CREATE INDEX "AIEvalDataset_organizationId_idx" ON "AIEvalDataset"("organizationId");

-- CreateIndex
CREATE INDEX "AIEvalRun_organizationId_createdAt_idx" ON "AIEvalRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInsight_organizationId_status_createdAt_idx" ON "AIInsight"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIInsight_organizationId_fingerprint_key" ON "AIInsight"("organizationId", "fingerprint");

-- CreateIndex
CREATE INDEX "Experiment_organizationId_status_idx" ON "Experiment"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentVariant_experimentId_key_key" ON "ExperimentVariant"("experimentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_organizationId_key_key" ON "FeatureFlag"("organizationId", "key");

-- CreateIndex
CREATE INDEX "SavedFilter_userId_page_idx" ON "SavedFilter"("userId", "page");

-- CreateIndex
CREATE INDEX "ConfigHistory_organizationId_area_createdAt_idx" ON "ConfigHistory"("organizationId", "area", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_pushEndpoint_key" ON "UserDevice"("pushEndpoint");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_tokenHash_key" ON "UserDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "UserDevice_userId_status_idx" ON "UserDevice"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeepLink_codeHash_key" ON "DeepLink"("codeHash");

-- CreateIndex
CREATE INDEX "DeepLink_userId_createdAt_idx" ON "DeepLink"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_temperature_idx" ON "Lead"("organizationId", "temperature");

-- CreateIndex
CREATE INDEX "Lead_organizationId_lifecycle_idx" ON "Lead"("organizationId", "lifecycle");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_type_createdAt_idx" ON "Notification"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_updatedAt_idx" ON "Opportunity"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_health_idx" ON "Opportunity"("organizationId", "health");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_idempotencyKey_key" ON "Webhook"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "WebhookAttempt" ADD CONSTRAINT "WebhookAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyingSignal" ADD CONSTRAINT "BuyingSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentEvent" ADD CONSTRAINT "IntentEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextBestAction" ADD CONSTRAINT "NextBestAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEvalCase" ADD CONSTRAINT "AIEvalCase_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AIEvalDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEvalRun" ADD CONSTRAINT "AIEvalRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AIEvalDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill de dados (V2)
UPDATE "KnowledgeDocument" SET "status" = 'PUBLISHED' WHERE "status" = 'ACTIVE';
UPDATE "Opportunity" SET "stageChangedAt" = "updatedAt", "lastActivityAt" = "updatedAt";
