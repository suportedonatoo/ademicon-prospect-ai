import { authed } from '@/lib/api';
import { db } from '@/lib/db';
import { audit } from '@/modules/audit/audit.service';

/** DELETE /api/v1/apikeys/:id — revoga a chave. */
export const DELETE = authed<{ id: string }>({ permission: 'apikey.manage' }, async ({ ctx, params }) => {
  await db.apiKey.updateMany({ where: { id: params.id, organizationId: ctx.orgId }, data: { revokedAt: new Date() } });
  await audit(ctx, 'apikey.changed', { type: 'ApiKey', id: params.id }, { action: 'revoked' });
  return { ok: true };
});
