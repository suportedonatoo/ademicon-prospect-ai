import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { db } from '@/lib/db';
import { createApiKey } from '@/modules/auth/auth.service';
import { ALL_PERMISSIONS } from '@/modules/roles/permissions';

export const GET = authed({ permission: 'apikey.manage' }, async ({ ctx }) =>
  db.apiKey.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true, prefix: true, permissions: true, lastUsedAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
);

/** POST /api/v1/apikeys — cria chave (o segredo aparece uma única vez). */
export const POST = authed({ permission: 'apikey.manage', rate: 10 }, async ({ req, ctx }) => {
  const input = z.object({ name: z.string().min(3).max(80), permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1) }).parse(await body(req));
  const { key, secret } = await createApiKey(ctx, input.name, input.permissions);
  return { id: key.id, prefix: key.prefix, secret };
});
