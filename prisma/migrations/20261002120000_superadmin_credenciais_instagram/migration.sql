-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "instagramUrl" TEXT;

-- CreateTable
CREATE TABLE "PlatformCredential" (
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "last4" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCredential_pkey" PRIMARY KEY ("key")
);

