-- Prospecção: nota e número de avaliações no Google (qualidade do contato).
ALTER TABLE "BusinessProspect" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "BusinessProspect" ADD COLUMN "reviews" INTEGER;
