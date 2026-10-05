CREATE TABLE "PostTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'QUALQUER',
    "audience" TEXT,
    "product" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostTemplate_organizationId_active_approved_idx" ON "PostTemplate"("organizationId", "active", "approved");

CREATE TABLE "TrackedLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CANAL',
    "name" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'OUTRO',
    "target" TEXT NOT NULL DEFAULT 'PROPRIO',
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrackedLink_code_key" ON "TrackedLink"("code");
CREATE INDEX "TrackedLink_organizationId_consultantId_idx" ON "TrackedLink"("organizationId", "consultantId");
