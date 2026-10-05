import { authed, query } from '@/lib/api';
import { listDecisions } from '@/modules/lead-routing/routing.service';

/** GET /api/v1/routing/decisions?leadId= — trilha de decisões do Lead Router. */
export const GET = authed({ permission: 'routing.read' }, async ({ req, ctx }) => listDecisions(ctx, { leadId: query(req).leadId }));
