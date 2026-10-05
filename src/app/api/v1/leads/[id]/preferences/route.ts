import { authed, body } from '@/lib/api';
import { updatePreferences } from '@/modules/privacy/privacy.service';

/** PUT /api/v1/leads/:id/preferences — preferências de comunicação (LGPD). */
export const PUT = authed<{ id: string }>({ permission: 'lead.update' }, async ({ req, ctx, params }) => updatePreferences(ctx, params.id, await body(req)));
