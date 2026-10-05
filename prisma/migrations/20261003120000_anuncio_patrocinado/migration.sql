-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "sponsorConsultantIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

