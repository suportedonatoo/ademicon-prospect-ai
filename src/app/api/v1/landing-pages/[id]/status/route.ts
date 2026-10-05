import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setLandingStatus } from '@/modules/landing-pages/landing.service';

export const POST = authed<{ id: string }>({ permission: 'landing.publish' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) }).parse(await body(req));
  await setLandingStatus(ctx, params.id, status);
  return { ok: true };
});
