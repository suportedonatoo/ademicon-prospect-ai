import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { resolveNba } from '@/modules/lead-intelligence/intelligence-v2.service';

/** PATCH /api/v1/nba/:id — marcar próxima ação como feita ou descartada. */
export const PATCH = authed<{ id: string }>({ permission: 'lead.update' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['DONE', 'DISMISSED']) }).parse(await body(req));
  return resolveNba(ctx, params.id, status);
});
