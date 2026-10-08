-- AlterTable
ALTER TABLE "InstagramCommentDm" ADD COLUMN     "ruleId" TEXT;

-- CreateTable
CREATE TABLE "InstagramPostRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "mediaId" TEXT,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "message" TEXT NOT NULL,
    "publicReply" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPostRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramPostRule_mediaId_idx" ON "InstagramPostRule"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPostRule_consultantId_shortcode_key" ON "InstagramPostRule"("consultantId", "shortcode");
