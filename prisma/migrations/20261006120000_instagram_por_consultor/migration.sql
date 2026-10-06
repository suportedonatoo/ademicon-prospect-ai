-- Instagram por consultor: cada consultor conecta a própria conta (uma por consultor) e as DMs dela viram leads dele.
ALTER TABLE "Consultant"
  ADD COLUMN "instagramAccountId" TEXT,
  ADD COLUMN "instagramUsername" TEXT,
  ADD COLUMN "instagramTokenEnc" TEXT,
  ADD COLUMN "instagramTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Consultant_instagramAccountId_key" ON "Consultant"("instagramAccountId");
