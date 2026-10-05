import { authed, body, query } from '@/lib/api';
import { listProspects, searchBusinesses } from '@/modules/business-prospecting/prospecting.service';

/** GET /api/v1/prospecting — empresas coletadas. */
export const GET = authed({ permission: 'prospecting.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return listProspects(ctx, { status: q.status, city: q.city, q: q.q, page: Number(q.page ?? 1) });
});

/** POST /api/v1/prospecting — busca em fonte autorizada (Google Maps, Bing Maps, cadastro empresarial). */
export const POST = authed({ permission: 'prospecting.search', rate: 30 }, async ({ req, ctx }) => searchBusinesses(ctx, await body(req)));
