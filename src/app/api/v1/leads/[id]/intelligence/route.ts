import { authed } from '@/lib/api';
import { getLeadDetail } from '@/modules/leads/leads.service';
import { recommendNextActions } from '@/modules/lead-intelligence/intelligence.service';

/** GET /api/v1/leads/:id/intelligence — recomendações de próxima ação (explicáveis). */
export const GET = authed<{ id: string }>({ permission: 'lead.read' }, async ({ ctx, params }) => {
  const lead = await getLeadDetail(ctx, params.id);
  return recommendNextActions(lead, {
    openTasks: lead.tasks.length,
    hasOpenOpportunity: lead.opportunities.some((o) => o.status === 'OPEN'),
    conversationMode: lead.conversations[0]?.mode,
    objections: lead.memory?.objections ?? [],
  });
});
