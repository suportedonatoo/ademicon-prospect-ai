-- Busca no Google: resultados por busca e centro das cidades (raio)
-- AlterTable
ALTER TABLE "ProspectSearch" ADD COLUMN     "sourceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "GeoPoint" (
    "key" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoPoint_pkey" PRIMARY KEY ("key")
);

