import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setRolePermission } from '@/modules/users/user.service';

/** PUT /api/v1/roles/:id/permissions — { permission, granted } (auditado). */
export const PUT = authed<{ id: string }>({ permission: 'role.manage' }, async ({ req, ctx, params }) => {
  const { permission, granted } = z.object({ permission: z.string(), granted: z.boolean() }).parse(await body(req));
  await setRolePermission(ctx, params.id, permission, granted);
  return { ok: true };
});
