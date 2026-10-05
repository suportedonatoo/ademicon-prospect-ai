import { authed, query } from '@/lib/api';
import { listNotifications, markAllRead } from '@/modules/notifications/notification.service';

/** GET /api/v1/notifications?status=all|unread|read&category=&priority=&cursor= — Central de notificações. */
export const GET = authed({ device: true }, async ({ req, ctx }) => listNotifications(ctx, query(req)));

/** POST /api/v1/notifications — marca todas como lidas. */
export const POST = authed({ device: true }, async ({ ctx }) => {
  await markAllRead(ctx);
  return { ok: true };
});
