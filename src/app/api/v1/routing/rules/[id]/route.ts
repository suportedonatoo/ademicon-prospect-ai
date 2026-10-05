import { authed, body } from '@/lib/api';
import { deleteRule, saveRule } from '@/modules/lead-routing/rules.service';

export const PATCH = authed<{ id: string }>({ permission: 'routing.configure' }, async ({ req, ctx, params }) => saveRule(ctx, await body(req), params.id));
export const DELETE = authed<{ id: string }>({ permission: 'routing.configure' }, async ({ ctx, params }) => {
  await deleteRule(ctx, params.id);
  return { ok: true };
});
