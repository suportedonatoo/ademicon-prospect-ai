import { authed, query } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiObservability, commercialAnalytics, executiveDashboard, managementBreakdown, marketingAnalytics, opportunitiesByStage, performance, roiReport } from '@/modules/analytics/analytics.service';

/**
 * GET /api/v1/analytics?view=dashboard|performance|stages|marketing|commercial|management|roi|ai
 * Filtros globais: period, from, to, region, pjId, consultantId, product, source, campaignId (+ dim para management)
 */
export const GET = authed({ permission: 'analytics.read' }, async ({ req, ctx }) => {
  const q = query(req);
  const f = resolveFilters(q);
  switch (q.view ?? 'dashboard') {
    case 'dashboard':
      return executiveDashboard(ctx, f);
    case 'performance':
      return performance(ctx, f);
    case 'stages':
      return opportunitiesByStage(ctx, f);
    case 'marketing':
      return marketingAnalytics(ctx, f);
    case 'commercial':
      return commercialAnalytics(ctx, f);
    case 'management':
      return managementBreakdown(ctx, f, (['region', 'product', 'source', 'campaignId'].includes(q.dim) ? q.dim : 'source') as 'source');
    case 'roi':
      return roiReport(ctx, f);
    case 'ai':
      return aiObservability(ctx, f);
    default:
      throw BadRequest('view inválida');
  }
});
