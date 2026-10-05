-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "aiProfile" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "routingHint" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppNumber" ADD COLUMN     "consultantId" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastErrorAt" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WhatsAppNumber_consultantId_idx" ON "WhatsAppNumber"("consultantId");

-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

