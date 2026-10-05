import { authed, query } from '@/lib/api';
import { resolveFilters } from '@/modules/analytics/filters';
import { attributionReport, recentJourneys } from '@/modules/attribution/attribution.service';

/** GET /api/v1/attribution?period=30d — funil por origem e jornadas recentes. */
export const GET = authed({ permission: 'attribution.read' }, async ({ req, ctx }) => {
  const f = resolveFilters(query(req));
  const [report, journeys] = await Promise.all([attributionReport(ctx, f), recentJourneys(ctx)]);
  return { ...report, journeys };
});
