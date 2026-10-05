import { authed } from '@/lib/api';
import { scanFollowUps } from '@/modules/automations/followup.engine';
import { retryDueWebhooks } from '@/modules/webhooks/webhook.service';

/** POST /api/v1/automations/run — executa agora o Follow-up Engine e retentativas de webhooks. */
export const POST = authed({ permission: 'automation.manage', rate: 10 }, async ({ ctx }) => {
  const followUps = await scanFollowUps(ctx.orgId);
  const webhooks = await retryDueWebhooks();
  return { followUps, webhooksRetried: webhooks };
});
