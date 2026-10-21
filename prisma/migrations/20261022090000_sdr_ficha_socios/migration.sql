-- Ficha completa da empresa, cadência do SDR e histórico de contatos
-- AlterTable
ALTER TABLE "BusinessProspect" ADD COLUMN     "qualification" JSONB,
ADD COLUMN     "registry" JSONB,
ADD COLUMN     "sdrMessage" TEXT,
ADD COLUMN     "sdrNextAt" TIMESTAMP(3),
ADD COLUMN     "sdrStage" TEXT,
ADD COLUMN     "sdrStartedAt" TIMESTAMP(3),
ADD COLUMN     "sdrStep" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProspectActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "consultantId" TEXT,
    "step" INTEGER,
    "channel" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectActivity_prospectId_createdAt_idx" ON "ProspectActivity"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectActivity_organizationId_consultantId_createdAt_idx" ON "ProspectActivity"("organizationId", "consultantId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessProspect_organizationId_assignedConsultantId_sdrNex_idx" ON "BusinessProspect"("organizationId", "assignedConsultantId", "sdrNextAt");

-- AddForeignKey
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "BusinessProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

