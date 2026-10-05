import { authed, body } from '@/lib/api';
import { getAISettings, updateAISettings } from '@/modules/ai/ai-admin.service';

/** GET/PUT /api/v1/ai/settings — personalidade, regras, handoff e Knowledge Base. */
export const GET = authed({ permission: 'ai.read' }, async ({ ctx }) => getAISettings(ctx));
export const PUT = authed({ permission: 'ai.configure' }, async ({ req, ctx }) => {
  await updateAISettings(ctx, await body(req));
  return getAISettings(ctx);
});
