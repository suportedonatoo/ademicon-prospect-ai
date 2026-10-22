import { authed, query } from '@/lib/api';
import { AppError, BadRequest } from '@/lib/errors';
import { providers } from '@/modules/integrations/registry';
import { cleanCnpj, isValidCnpj } from '@/modules/cnpj/cnpj-id';

/** GET /api/v1/prospecting/cnpj?cnpj= — Cadastro Nacional de Empresas (base local da Receita → BrasilAPI). */
export const GET = authed({ permission: 'prospecting.read', rate: 60 }, async ({ req }) => {
  const cnpj = cleanCnpj(query(req).cnpj);
  if (cnpj.length !== 14) throw BadRequest('CNPJ precisa ter 14 caracteres.');
  if (!isValidCnpj(cnpj)) throw BadRequest('CNPJ inválido (dígito verificador não confere).');
  // Falha do serviço externo vira mensagem clara (e não "erro interno").
  const company = await providers.companyRegistry.lookupCnpj(cnpj).catch((e: Error) => {
    throw new AppError(502, 'REGISTRY_UNAVAILABLE', `Consulta de CNPJ indisponível agora: ${e.message}`);
  });
  return { company, mode: providers.companyRegistry.mode };
});
