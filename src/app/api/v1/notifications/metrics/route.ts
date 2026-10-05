import { authed, query } from '@/lib/api';
import { resolveFilters } from '@/modules/analytics/filters';
import { notificationMetrics } from '@/modules/notifications/notification.service';

/** GET /api/v1/notifications/metrics — entrega, abertura, clique e ação após notificação. */
export const GET = authed({ permission: 'notification.read' }, async ({ req, ctx }) => {
  const f = resolveFilters(query(req));
  return notificationMetrics(ctx, f.from, f.to);
});
