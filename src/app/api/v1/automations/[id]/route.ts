import { authed, body } from '@/lib/api';
import { saveRule, toggleRule } from '@/modules/automations/automation.engine';

export const PATCH = authed<{ id: string }>({ permission: 'automation.manage' }, async ({ req, ctx, params }) => {
  const input = await body<Record<string, unknown>>(req);
  if (Object.keys(input).length === 1 && typeof input.active === 'boolean') {
    await toggleRule(ctx, params.id, input.active);
    return { ok: true };
  }
  return saveRule(ctx, input, params.id);
});
