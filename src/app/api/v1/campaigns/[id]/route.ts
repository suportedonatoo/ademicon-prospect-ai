import { authed, body } from '@/lib/api';
import { getCampaign, saveCampaign } from '@/modules/campaigns/campaign.service';

export const GET = authed<{ id: string }>({ permission: 'campaign.read' }, async ({ ctx, params }) => getCampaign(ctx, params.id));
export const PATCH = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => saveCampaign(ctx, await body(req), params.id));
