-- Acessos e simulações do link próprio do consultor (/c/<slug>) para o quadro "Meu link".
ALTER TABLE "AttributionSession" ADD COLUMN IF NOT EXISTS "consultantId" TEXT;
ALTER TABLE "Simulation" ADD COLUMN IF NOT EXISTS "consultantId" TEXT;
CREATE INDEX IF NOT EXISTS "AttributionSession_consultantId_lastSeenAt_idx" ON "AttributionSession"("consultantId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "Simulation_consultantId_createdAt_idx" ON "Simulation"("consultantId", "createdAt");
