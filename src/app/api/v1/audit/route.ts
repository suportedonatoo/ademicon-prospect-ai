import { authed, query } from '@/lib/api';
import { listAudit } from '@/modules/audit/audit.service';

/** GET /api/v1/audit?action=&entityType=&page= */
export const GET = authed({ permission: 'audit.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return listAudit(ctx, { action: q.action, entityType: q.entityType, page: Number(q.page ?? 1) });
});
