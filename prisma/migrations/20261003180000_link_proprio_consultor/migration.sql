-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "landingSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_landingSlug_key" ON "Consultant"("landingSlug");

