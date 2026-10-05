import { authed, query } from '@/lib/api';
import { AppError, BadRequest } from '@/lib/errors';
import { providers } from '@/modules/integrations/registry';

/** GET /api/v1/prospecting/cnpj?cnpj= — Cadastro Nacional de Empresas (Receita via BrasilAPI). */
export const GET = authed({ permission: 'prospecting.read', rate: 60 }, async ({ req }) => {
  const cnpj = (query(req).cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw BadRequest('CNPJ precisa ter 14 dígitos.');
  // Falha do serviço externo vira mensagem clara (e não "erro interno").
  const company = await providers.companyRegistry.lookupCnpj(cnpj).catch((e: Error) => {
    throw new AppError(502, 'REGISTRY_UNAVAILABLE', `Consulta de CNPJ indisponível agora: ${e.message}`);
  });
  return { company, mode: providers.companyRegistry.mode };
});
