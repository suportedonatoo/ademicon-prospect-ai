-- Prospecção: nota e número de avaliações no Google (qualidade do contato).
-- IF NOT EXISTS: em produção as colunas podem ter sido criadas antes pelo SQL Editor do Supabase.
ALTER TABLE "BusinessProspect" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION;
ALTER TABLE "BusinessProspect" ADD COLUMN IF NOT EXISTS "reviews" INTEGER;
