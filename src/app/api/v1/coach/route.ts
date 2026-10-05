import { authed, query } from '@/lib/api';
import { resolveFilters } from '@/modules/analytics/filters';
import { salesCoach } from '@/modules/coach/coach.service';

/** GET /api/v1/coach — AI Sales Coach (indicadores + sugestões de treinamento, sem ranking). */
export const GET = authed({ permission: 'consultant.read' }, async ({ req, ctx }) => {
  const f = resolveFilters(query(req));
  return salesCoach(ctx, f.from, f.to);
});
