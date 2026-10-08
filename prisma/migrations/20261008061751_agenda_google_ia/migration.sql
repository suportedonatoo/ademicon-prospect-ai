-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "googleCalendarEmail" TEXT,
ADD COLUMN     "googleCalendarTokenEnc" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "scheduling" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "taskId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "location" TEXT,
    "googleEventId" TEXT,
    "meetLink" TEXT,
    "htmlLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_consultantId_startAt_idx" ON "Meeting"("consultantId", "startAt");

-- CreateIndex
CREATE INDEX "Meeting_leadId_idx" ON "Meeting"("leadId");
