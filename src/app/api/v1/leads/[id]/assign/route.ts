import { z } from 'zod';
import { authed } from '@/lib/api';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import { leadScope } from '@/modules/leads/scope';
import { assignLeadManually, routeLead } from '@/modules/lead-routing/routing.service';

const schema = z.object({ consultantId: z.string().optional() });

/** POST /api/v1/leads/:id/assign — sem consultantId: Lead Router automático; com: atribuição manual. */
export const POST = authed<{ id: string }>({ permission: 'lead.assign' }, async ({ req, ctx, params }) => {
  const { consultantId } = schema.parse(await req.json().catch(() => ({})));
  if (consultantId) return assignLeadManually(ctx, params.id, consultantId);
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: params.id } });
  if (!lead) throw NotFound('Lead');
  return routeLead(ctx, lead.id);
});
