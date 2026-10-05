import { authed, body, query } from '@/lib/api';
import { createOpportunity, getBoard, listOpportunities } from '@/modules/opportunities/opportunity.service';

/** GET /api/v1/opportunities — lista (ou ?view=board para o Kanban). */
export const GET = authed({ permission: 'opportunity.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return q.view === 'board' ? getBoard(ctx, q) : listOpportunities(ctx, q);
});

/** POST /api/v1/opportunities — cria oportunidade a partir de um lead. */
export const POST = authed({ permission: 'opportunity.create', idempotent: true }, async ({ req, ctx }) => createOpportunity(ctx, await body(req)));
