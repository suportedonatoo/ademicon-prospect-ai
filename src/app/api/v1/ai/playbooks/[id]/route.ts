import { authed, body } from '@/lib/api';
import { updatePlaybook } from '@/modules/ai/ai-admin.service';

export const PATCH = authed<{ id: string }>({ permission: 'ai.configure' }, async ({ req, ctx, params }) => {
  await updatePlaybook(ctx, params.id, await body(req));
  return { ok: true };
});
