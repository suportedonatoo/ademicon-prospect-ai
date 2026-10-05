-- AlterTable
ALTER TABLE "WhatsAppNumber" ADD COLUMN     "providerNumberId" TEXT;

-- CreateTable
CREATE TABLE "TrainingItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingItem_organizationId_active_order_idx" ON "TrainingItem"("organizationId", "active", "order");

-- CreateIndex
CREATE INDEX "TrainingProgress_organizationId_userId_idx" ON "TrainingProgress"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_itemId_userId_key" ON "TrainingProgress"("itemId", "userId");

-- CreateIndex
CREATE INDEX "Message_externalId_idx" ON "Message"("externalId");

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrainingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

