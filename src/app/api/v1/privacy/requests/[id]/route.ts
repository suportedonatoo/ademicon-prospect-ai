import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { updateDataRequest } from '@/modules/privacy/privacy.service';

/** PATCH /api/v1/privacy/requests/:id — { status, notes } (exclusão concluída = anonimização). */
export const PATCH = authed<{ id: string }>({ permission: 'privacy.manage' }, async ({ req, ctx, params }) => {
  const { status, notes } = z.object({ status: z.enum(['IN_PROGRESS', 'DONE', 'REJECTED']), notes: z.string().max(1000).optional() }).parse(await body(req));
  return updateDataRequest(ctx, params.id, status, notes);
});
