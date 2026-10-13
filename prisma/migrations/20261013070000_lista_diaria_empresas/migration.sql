-- Lista diária de empresas por consultor + contador de uso de APIs pagas (teto de custo)
ALTER TABLE "BusinessProspect" ADD COLUMN "assignedConsultantId" TEXT, ADD COLUMN "assignedDay" DATE;
CREATE INDEX "BusinessProspect_organizationId_assignedConsultantId_assign_idx" ON "BusinessProspect"("organizationId", "assignedConsultantId", "assignedDay");

CREATE TABLE "ApiUsage" (
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("key","day")
);
