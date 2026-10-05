import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { toggleSubscription } from '@/modules/webhooks/webhook.service';

export const PATCH = authed<{ id: string }>({ permission: 'webhook.manage' }, async ({ req, ctx, params }) => {
  const { active } = z.object({ active: z.boolean() }).parse(await body(req));
  await toggleSubscription(ctx, params.id, active);
  return { ok: true };
});
