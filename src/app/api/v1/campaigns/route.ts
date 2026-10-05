import { authed, body, query } from '@/lib/api';
import { listCampaigns, saveCampaign } from '@/modules/campaigns/campaign.service';

/** GET /api/v1/campaigns — campanhas com métricas agregadas (CPL, CPQL). */
export const GET = authed({ permission: 'campaign.read' }, async ({ req, ctx }) => listCampaigns(ctx, query(req)));

/** POST /api/v1/campaigns — cria campanha (DRAFT). */
export const POST = authed({ permission: 'campaign.create' }, async ({ req, ctx }) => saveCampaign(ctx, await body(req)));
