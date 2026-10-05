import { z } from 'zod';
import { authed, body, query } from '@/lib/api';
import { db } from '@/lib/db';
import { Forbidden } from '@/lib/errors';

/** GET /api/v1/saved-filters?page= — filtros favoritos do usuário. */
export const GET = authed({}, async ({ req, ctx }) => {
  if (!ctx.userId) throw Forbidden();
  const page = query(req).page;
  return db.savedFilter.findMany({ where: { userId: ctx.userId, organizationId: ctx.orgId, ...(page ? { page } : {}) }, orderBy: { createdAt: 'desc' } });
});

/** POST /api/v1/saved-filters — { page, name, query }. */
export const POST = authed({}, async ({ req, ctx }) => {
  if (!ctx.userId) throw Forbidden();
  const i = z.object({ page: z.string().regex(/^\/[a-z0-9\-/]*$/).max(80), name: z.string().min(1).max(60), query: z.string().max(1000) }).parse(await body(req));
  const count = await db.savedFilter.count({ where: { userId: ctx.userId } });
  if (count >= 50) throw Forbidden('Limite de 50 filtros salvos.');
  return db.savedFilter.create({ data: { organizationId: ctx.orgId, userId: ctx.userId, ...i } });
});

/** DELETE /api/v1/saved-filters?id= */
export const DELETE = authed({}, async ({ req, ctx }) => {
  if (!ctx.userId) throw Forbidden();
  await db.savedFilter.deleteMany({ where: { id: query(req).id ?? '', userId: ctx.userId } });
  return { ok: true };
});
