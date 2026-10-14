-- Consultor autorizado a vender com a marca Ademicon (página própria com nome e logo)
ALTER TABLE "Consultant" ADD COLUMN "brandAuthorized" BOOLEAN NOT NULL DEFAULT false;
