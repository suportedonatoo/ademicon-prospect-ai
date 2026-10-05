import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { changeCampaignStatus } from '@/modules/campaigns/campaign.service';

/** POST /api/v1/campaigns/:id/status — DRAFT → SCHEDULED → ACTIVE ⇄ PAUSED → COMPLETED */
export const POST = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED']) }).parse(await body(req));
  await changeCampaignStatus(ctx, params.id, status);
  return { ok: true };
});
