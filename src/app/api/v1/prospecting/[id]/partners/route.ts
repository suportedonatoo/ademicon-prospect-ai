import { z } from 'zod';
import { authed, body, query } from '@/lib/api';
import { addPartnerCompany, partnerCompanies } from '@/modules/business-prospecting/partner-network.service';

/** GET /api/v1/prospecting/:id/partners?name= — outras empresas do sócio (base + fonte), com nota. */
export const GET = authed<{ id: string }>({ permission: 'prospecting.read', rate: 30 }, async ({ req, ctx, params }) => partnerCompanies(ctx, params.id, query(req).name ?? ''));

/** POST /api/v1/prospecting/:id/partners — { name, cnpj }: traz a empresa do sócio para a lista do consultor. */
export const POST = authed<{ id: string }>({ permission: 'prospecting.convert', rate: 30 }, async ({ req, ctx, params }) => {
  const input = z.object({ name: z.string().min(2).max(200), cnpj: z.string().min(14).max(20) }).parse(await body(req));
  const p = await addPartnerCompany(ctx, params.id, input.name, input.cnpj);
  return { id: p.id };
});
