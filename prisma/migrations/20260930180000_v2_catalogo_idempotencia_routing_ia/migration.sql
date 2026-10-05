-- AlterTable
ALTER TABLE "RoutingDecision" ADD COLUMN     "aiRecommendation" JSONB;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_organizationId_key_key" ON "ProductCategory"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Product_organizationId_status_idx" ON "Product"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_key_key" ON "Product"("organizationId", "key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_route_key_key" ON "IdempotencyRecord"("organizationId", "route", "key");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preservação de dados: o catálogo nasce com os produtos que já existiam no código (por organização).
INSERT INTO "ProductCategory" ("id", "organizationId", "key", "name", "sortOrder")
SELECT 'pc_' || o."id" || '_CONSORCIO', o."id", 'CONSORCIO', 'Consórcio', 0 FROM "Organization" o
ON CONFLICT DO NOTHING;

INSERT INTO "Product" ("id", "organizationId", "categoryId", "key", "name", "sortOrder", "updatedAt")
SELECT 'pr_' || o."id" || '_' || p.key, o."id", 'pc_' || o."id" || '_CONSORCIO', p.key, p.name, p.ord, now()
FROM "Organization" o
CROSS JOIN (VALUES ('IMOVEL', 'Imóvel', 1), ('VEICULO', 'Veículo', 2), ('MOTO', 'Moto', 3), ('SERVICOS', 'Serviços', 4), ('BENS_MOVEIS', 'Bens Móveis', 5)) AS p(key, name, ord)
ON CONFLICT DO NOTHING;
