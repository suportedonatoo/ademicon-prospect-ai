import { authed, query } from '@/lib/api';
import { generateInsights, listInsights } from '@/modules/insights/insights.service';
import { assertFlag } from '@/modules/organizations/flags.service';

/** GET /api/v1/insights?status=OPEN|ACKNOWLEDGED|DISMISSED — AI Insights (regras com dados de origem). */
export const GET = authed({ permission: 'analytics.read' }, async ({ req, ctx }) => listInsights(ctx, query(req).status || 'OPEN'));

/** POST /api/v1/insights — gerar agora. */
export const POST = authed({ permission: 'analytics.read', rate: 5 }, async ({ ctx }) => {
  await assertFlag(ctx.orgId, 'AI_INSIGHTS');
  return generateInsights(ctx.orgId);
});
