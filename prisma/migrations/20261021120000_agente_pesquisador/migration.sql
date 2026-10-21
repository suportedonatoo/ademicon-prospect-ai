-- Agente Pesquisador: dados cadastrais, análise com nota e resultado do contato
ALTER TABLE "BusinessProspect"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "openedAt" DATE,
  ADD COLUMN "shareCapital" DOUBLE PRECISION,
  ADD COLUMN "partners" JSONB,
  ADD COLUMN "researchScore" INTEGER,
  ADD COLUMN "research" JSONB,
  ADD COLUMN "researchedAt" TIMESTAMP(3),
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "outcomeAt" TIMESTAMP(3);
