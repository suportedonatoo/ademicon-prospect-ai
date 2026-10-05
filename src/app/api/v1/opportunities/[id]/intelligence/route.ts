import { authed } from '@/lib/api';
import { getOpportunityIntelligence } from '@/modules/opportunities/opportunity-intelligence.service';

/** GET /api/v1/opportunities/:id/intelligence — saúde, risco, idade na etapa, velocidade e follow-up. */
export const GET = authed<{ id: string }>({ permission: 'opportunity.read' }, async ({ ctx, params }) => getOpportunityIntelligence(ctx, params.id));
