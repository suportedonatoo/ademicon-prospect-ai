import { authed, body, query } from '@/lib/api';
import { listPjs, savePj } from '@/modules/pjs/pj.service';

/** GET /api/v1/pjs?q=&regionId=&page= — paginado (preparado para 1000+ PJs). */
export const GET = authed({ permission: 'pj.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return listPjs(ctx, { q: q.q, regionId: q.regionId, page: Number(q.page ?? 1), pageSize: Number(q.pageSize ?? 50) });
});
export const POST = authed({ permission: 'pj.manage' }, async ({ req, ctx }) => savePj(ctx, await body(req)));
