import { z } from 'zod';
import { authed, body, query } from '@/lib/api';
import { importCampaigns, remoteCampaigns, syncAllMetrics } from '@/modules/platform/ads.service';

const source = z.enum(['GOOGLE_ADS', 'META']);

/** GET ?source= — campanhas da conta no provedor. POST { action: import | sync, source } */
export const GET = authed({}, async ({ req, ctx }) => remoteCampaigns(ctx, source.parse(query(req).source)));
export const POST = authed({ rate: 20 }, async ({ req, ctx }) => {
  const input = z.object({ action: z.enum(['import', 'sync']), source }).parse(await body(req));
  return input.action === 'import' ? importCampaigns(ctx, input.source) : syncAllMetrics(ctx, input.source);
});
