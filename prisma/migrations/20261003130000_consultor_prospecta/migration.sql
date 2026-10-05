-- Consultor passa a prospectar empresas (Google/Bing Maps e CNPJ). Só ACRESCENTA a permissão aos perfis
-- "Consultor" já existentes; não remove nada que a gestão tenha ajustado.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('prospecting.read', 'prospecting.search', 'prospecting.convert')
WHERE r."key" = 'CONSULTANT'
ON CONFLICT DO NOTHING;
