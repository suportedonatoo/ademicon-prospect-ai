-- AlterTable
ALTER TABLE "AttributionSession" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "pjId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "landingHeat" TEXT,
ADD COLUMN     "originPjId" TEXT;

-- AlterTable
ALTER TABLE "PJ" ADD COLUMN     "landingActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landingSimulatorId" TEXT,
ADD COLUMN     "landingSubtitle" TEXT,
ADD COLUMN     "landingTitle" TEXT,
ADD COLUMN     "subdomain" TEXT;

-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "heat" TEXT,
ADD COLUMN     "pjId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PJ_subdomain_key" ON "PJ"("subdomain");

-- CreateIndex
CREATE INDEX "Simulation_organizationId_pjId_createdAt_idx" ON "Simulation"("organizationId", "pjId", "createdAt");

