import { authed, query } from '@/lib/api';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiControlCenter } from '@/modules/ai/lab.service';

/** GET /api/v1/ai/control-center — uso, custo, latência, erros, handoffs, confiança e modelos. */
export const GET = authed({ permission: 'ai.read' }, async ({ req, ctx }) => {
  const f = resolveFilters(query(req));
  return aiControlCenter(ctx, f.from, f.to);
});
