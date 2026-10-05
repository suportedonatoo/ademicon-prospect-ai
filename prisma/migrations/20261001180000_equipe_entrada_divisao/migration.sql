-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "splitBaseline" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "splitBaselineAt" TIMESTAMP(3);

