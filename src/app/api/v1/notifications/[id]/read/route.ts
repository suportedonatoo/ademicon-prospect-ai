import { authed } from '@/lib/api';
import { markRead } from '@/modules/notifications/notification.service';

/** POST /api/v1/notifications/:id/read */
export const POST = authed<{ id: string }>({ device: true }, async ({ ctx, params }) => markRead(ctx, params.id));
