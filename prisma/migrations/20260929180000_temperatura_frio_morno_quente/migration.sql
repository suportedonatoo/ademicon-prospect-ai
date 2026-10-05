-- Temperatura do lead passa de 4 faixas (FRIO/NUTRICAO/QUALIFICADO/ALTA_INTENCAO)
-- para 3 faixas: FRIO 0–40 · MORNO 41–70 · QUENTE 71–100 (padrão; configurável por organização).
-- Quem declarou interesse na landing da PJ nunca fica abaixo do que declarou.

UPDATE "Lead" SET "temperature" = CASE
  WHEN "optOut" THEN 'FRIO'
  WHEN "score" >= 71 OR "landingHeat" = 'QUENTE' THEN 'QUENTE'
  WHEN "score" >= 41 OR "landingHeat" = 'MORNO' THEN 'MORNO'
  ELSE 'FRIO'
END;

UPDATE "LeadScore" s SET "temperature" = l."temperature"
FROM "Lead" l WHERE l."id" = s."leadId";
