import { authed, body } from '@/lib/api';
import { updateAgent } from '@/modules/ai/ai-admin.service';

/** PATCH /api/v1/ai/agents/:id — ativo, modelo, temperature, instruções. */
export const PATCH = authed<{ id: string }>({ permission: 'ai.configure' }, async ({ req, ctx, params }) => {
  await updateAgent(ctx, params.id, await body(req));
  return { ok: true };
});
