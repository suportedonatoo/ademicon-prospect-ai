import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { resolveGap } from '@/modules/knowledge-base/knowledge.service';

export const PATCH = authed<{ id: string }>({ permission: 'knowledge.manage' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['RESOLVED', 'IGNORED']) }).parse(await body(req));
  await resolveGap(ctx, params.id, status);
  return { ok: true };
});
