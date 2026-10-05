import { authed, query } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiContribution, campaignIntelligence, commercialStages, funnelBy, lossIntelligence, productIntelligence, revenueFunnel } from '@/modules/revenue/revenue.service';

/**
 * GET /api/v1/revenue?view=funnel|by|campaigns|products|losses|ai|commercial (&dim= source|product|region|pjId|consultantId|campaignId)
 * Revenue Intelligence com os filtros globais (period, from, to, region, pjId, consultantId, product, source, campaignId).
 */
export const GET = authed({ permission: 'analytics.read' }, async ({ req, ctx }) => {
  const q = query(req);
  const f = resolveFilters(q);
  switch (q.view ?? 'funnel') {
    case 'funnel':
      return revenueFunnel(ctx, f);
    case 'by':
      return funnelBy(ctx, f, (['source', 'product', 'region', 'pjId', 'consultantId', 'campaignId'].includes(q.dim) ? q.dim : 'source') as 'source');
    case 'campaigns':
      return campaignIntelligence(ctx, f);
    case 'products':
      return productIntelligence(ctx, f);
    case 'losses':
      return lossIntelligence(ctx, f);
    case 'ai':
      return aiContribution(ctx, f);
    case 'commercial':
      return commercialStages(ctx, f);
    default:
      throw BadRequest('view inválida');
  }
});
