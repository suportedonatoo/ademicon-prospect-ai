import { authed } from '@/lib/api';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import { leadScope } from '@/modules/leads/scope';
import { rescoreLead } from '@/modules/lead-scoring/scoring.service';

/** GET /api/v1/leads/:id/score — score atual com o "porquê" (breakdown) e eventos. */
export const GET = authed<{ id: string }>({ permission: 'lead.read' }, async ({ ctx, params }) => {
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: params.id }, include: { scoreSnapshot: true, scoreEvents: { orderBy: { createdAt: 'desc' } } } });
  if (!lead) throw NotFound('Lead');
  return { score: lead.score, temperature: lead.temperature, intent: lead.intent, breakdown: lead.scoreSnapshot?.breakdown ?? [], events: lead.scoreEvents };
});

/** POST /api/v1/leads/:id/score — recalcula o score. */
export const POST = authed<{ id: string }>({ permission: 'lead.update' }, async ({ ctx, params }) => {
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: params.id } });
  if (!lead) throw NotFound('Lead');
  return rescoreLead(ctx, lead.id, { reason: 'Recálculo manual' });
});
