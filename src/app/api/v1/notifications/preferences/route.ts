import { authed, body } from '@/lib/api';
import { getPreferences, updatePreferences } from '@/modules/notifications/notification.service';

/** GET /api/v1/notifications/preferences — categorias × canais, horário de silêncio. */
export const GET = authed({}, async ({ ctx }) => getPreferences(ctx));

/** PUT /api/v1/notifications/preferences */
export const PUT = authed({}, async ({ req, ctx }) => updatePreferences(ctx, await body(req)));
