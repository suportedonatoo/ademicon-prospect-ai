import { authed, query } from '@/lib/api';
import { db } from '@/lib/db';

/** GET /api/v1/config-history?area= — histórico de alterações críticas (antes/depois/autor/data). */
export const GET = authed({ permission: 'audit.read' }, async ({ req, ctx }) => {
  const area = query(req).area;
  return db.configHistory.findMany({ where: { organizationId: ctx.orgId, ...(area ? { area } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
});
