import { authed } from '@/lib/api';
import { NotFound } from '@/lib/errors';
import { db } from '@/lib/db';
import { leadScope } from '@/modules/leads/scope';
import { refreshLeadIntelligence } from '@/modules/lead-intelligence/intelligence-v2.service';

/** POST /api/v1/leads/:id/intelligence/refresh — recalcula sub-scores, ciclo de vida e Next Best Action. */
export const POST = authed<{ id: string }>({ permission: 'lead.update', rate: 60 }, async ({ ctx, params }) => {
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: params.id }, select: { id: true } });
  if (!lead) throw NotFound('Lead');
  return refreshLeadIntelligence(ctx.orgId, lead.id);
});
