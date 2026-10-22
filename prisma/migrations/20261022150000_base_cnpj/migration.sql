-- Base CNPJ: registro das importações e cache da BrasilAPI. As tabelas da Receita ficam no schema "cnpj" (src/modules/cnpj/ddl.ts).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "CnpjImport" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "ufs" TEXT[],
    "status" TEXT NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CnpjImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CnpjCache" (
    "cnpj" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CnpjCache_pkey" PRIMARY KEY ("cnpj")
);

-- CreateIndex
CREATE INDEX "CnpjImport_status_startedAt_idx" ON "CnpjImport"("status", "startedAt");

