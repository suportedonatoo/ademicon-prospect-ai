-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "instagramAutoDm" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "InstagramCommentDm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consultantId" TEXT,
    "accountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "commenterId" TEXT NOT NULL,
    "commenterUsername" TEXT,
    "mediaId" TEXT,
    "commentText" TEXT NOT NULL,
    "keyword" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "leadId" TEXT,
    "photoSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramCommentDm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramCommentDm_commentId_key" ON "InstagramCommentDm"("commentId");

-- CreateIndex
CREATE INDEX "InstagramCommentDm_accountId_commenterId_createdAt_idx" ON "InstagramCommentDm"("accountId", "commenterId", "createdAt");

-- CreateIndex
CREATE INDEX "InstagramCommentDm_organizationId_createdAt_idx" ON "InstagramCommentDm"("organizationId", "createdAt");
