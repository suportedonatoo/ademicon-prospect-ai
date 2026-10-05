import { authed } from '@/lib/api';
import { getCampaign, syncCampaignMetrics } from '@/modules/campaigns/campaign.service';

/** POST /api/v1/campaigns/:id/sync — sincroniza métricas do provedor (mock ou real). */
export const POST = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ ctx, params }) => {
  await getCampaign(ctx, params.id);
  return { days: await syncCampaignMetrics(ctx.orgId, params.id, 90) };
});
