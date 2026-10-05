import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { opportunityScope } from '../leads/scope';
import { getOrgSettings } from '../organizations/settings';
import { assessOpportunity, type HealthResult } from './health-engine';

// OPPORTUNITY INTELLIGENCE — persiste saúde/risco e publica opportunity.stalled na transição.

async function assessOne(orgId: string, oppId: string, now = new Date()) {
  const o = await db.opportunity.findFirst({
    where: { id: oppId, organizationId: orgId },
    include: {
      stage: { select: { key: true, order: true } },
      lead: { select: { temperature: true, conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1, select: { messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true } } } } } },
    },
  });
  if (!o) return null;
  const [openTasks, overdueTasks] = await Promise.all([
    db.task.count({ where: { OR: [{ opportunityId: o.id }, { leadId: o.leadId }], status: 'OPEN' } }),
    db.task.count({ where: { OR: [{ opportunityId: o.id }, { leadId: o.leadId }], status: 'OPEN', dueAt: { lt: now } } }),
  ]);
  const settings = await getOrgSettings(orgId);
  const r = assessOpportunity(
    {
      status: o.status,
      stageKey: o.stage.key,
      stageOrder: o.stage.order,
      createdAt: o.createdAt,
      stageChangedAt: o.stageChangedAt,
      lastActivityAt: o.lastActivityAt,
      openTasks,
      overdueTasks,
      leadTemperature: o.lead.temperature,
      awaitingReply: o.lead.conversations[0]?.messages[0]?.direction === 'INBOUND',
    },
    settings.opportunityHealth,
    now
  );
  return { opp: o, result: r };
}

export async function refreshOpportunityHealth(orgId: string, oppId: string) {
  const a = await assessOne(orgId, oppId);
  if (!a || !a.result) return null;
  const { opp, result } = a;
  await db.opportunity.update({ where: { id: opp.id }, data: { health: result.health, healthScore: result.score, healthReasons: result.reasons } });
  if (result.health === 'STALLED' && opp.health !== 'STALLED') {
    await publish(orgId, 'opportunity.stalled', { opportunityId: opp.id, leadId: opp.leadId, consultantId: opp.consultantId, reasons: result.reasons });
  }
  return result;
}

/** Job: avalia todas as oportunidades abertas (em lotes). */
export async function scanOpportunityHealth(orgId: string) {
  const open = await db.opportunity.findMany({ where: { organizationId: orgId, status: 'OPEN' }, select: { id: true }, take: 2000, orderBy: { updatedAt: 'asc' } });
  const counts = { HEALTHY: 0, AT_RISK: 0, STALLED: 0 };
  for (const o of open) {
    const r = await refreshOpportunityHealth(orgId, o.id);
    if (r) counts[r.health]++;
  }
  return counts;
}

/** Detalhe para a tela da oportunidade (sempre calculado na hora). */
export async function getOpportunityIntelligence(ctx: Ctx, id: string): Promise<(HealthResult & { persisted: string | null }) | null> {
  assertCan(ctx, 'opportunity.read');
  const exists = await db.opportunity.findFirst({ where: { ...opportunityScope(ctx), id }, select: { id: true, health: true } });
  if (!exists) throw NotFound('Oportunidade');
  const a = await assessOne(ctx.orgId, id);
  if (!a?.result) return null;
  return { ...a.result, persisted: exists.health };
}
