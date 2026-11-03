import { authed, query } from '@/lib/api';
import { AppError, BadRequest } from '@/lib/errors';
import { providers } from '@/modules/integrations/registry';

/** GET /api/v1/prospecting/cnpj/rede?cnpj= — rede societária (só com a chave do cnpj.ai; até 10 consultas da cota). */
export const GET = authed({ permission: 'prospecting.read', rate: 10 }, async ({ req }) => {
  const cnpj = (query(req).cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw BadRequest('CNPJ precisa ter 14 dígitos.');
  const registry = providers.companyRegistry;
  if (!registry.network) throw BadRequest('A rede societária precisa da chave do cnpj.ai (Super Admin → Consulta de CNPJ).');
  const network = await registry.network(cnpj).catch((e: Error) => {
    throw new AppError(502, 'REGISTRY_UNAVAILABLE', `Rede societária indisponível agora: ${e.message}`);
  });
  return { network };
});
