import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope } from '../leads/scope';
import { getOrgSettings } from '../organizations/settings';
import { computeSubScores } from './subscores';
import { detectIntents, signalsFromMessage, type DetectedSignal } from './signal-detector';
import { recommend, type NbaRecommendation } from './nba-engine';
import { assessCapacity } from '../consultants/capacity-engine';

// LEAD INTELLIGENCE V2 — persiste sinais/intenções, recalcula sub-scores + ciclo de vida
// e mantém UMA Next Best Action aberta por lead (as anteriores ficam SUPERSEDED, com histórico).

const DAY = 86_400_000;
const RECENT_DAYS = 14;

/** Registra um sinal de compra (idempotente em janela de 10 min por tipo). */
export async function recordBuyingSignal(orgId: string, leadId: string, signal: DetectedSignal, source: string) {
  const recent = await db.buyingSignal.findFirst({ where: { organizationId: orgId, leadId, type: signal.type, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } });
  if (recent) return null;
  const created = await db.buyingSignal.create({ data: { organizationId: orgId, leadId, type: signal.type, source, confidence: signal.confidence, evidence: signal.evidence.slice(0, 300) } });
  await db.lead.updateMany({ where: { id: leadId, organizationId: orgId }, data: { lastSignalAt: created.createdAt } });
  return created;
}

/** Analisa uma mensagem do cliente: IntentEvents + BuyingSignals (regras com evidência). */
export async function analyzeInboundMessage(orgId: string, leadId: string, conversationId: string, messageId: string, text: string) {
  const intents = detectIntents(text);
  const inboundCount = await db.message.count({ where: { conversationId, direction: 'INBOUND' } });
  const signals = signalsFromMessage(text, { firstReply: inboundCount === 1, inboundCount });
  if (intents.length) {
    await db.intentEvent.createMany({
      data: intents.map((i) => ({ organizationId: orgId, leadId, conversationId, messageId, type: i.type, evidence: i.evidence.slice(0, 300), confidence: i.confidence, origin: 'RULE' })),
    });
  }
  for (const s of signals) await recordBuyingSignal(orgId, leadId, s, 'CONVERSATION');
  return { intents, signals };
}

async function gatherInputs(orgId: string, leadId: string) {
  const since = new Date(Date.now() - RECENT_DAYS * DAY);
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: orgId, deletedAt: null },
    include: {
      memory: { select: { objections: true, summary: true } },
      preference: true,
      consultant: { select: { id: true, maxOpenLeads: true, maxOpenOpportunities: true, available: true, active: true, workingHours: true } },
      conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1, select: { id: true, mode: true, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, senderType: true, createdAt: true } } } },
      opportunities: { where: { status: 'OPEN' }, orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, health: true, stage: { select: { key: true } } } },
    },
  });
  if (!lead) return null;
  const [inbound, outbound, lastHumanOrAi, buying, intents, openTasks, overdueTasks, simSent, served, consultantLeads, consultantOpps] = await Promise.all([
    db.message.count({ where: { conversation: { leadId }, direction: 'INBOUND' } }),
    db.message.count({ where: { conversation: { leadId }, direction: 'OUTBOUND', senderType: { in: ['AI', 'HUMAN'] } } }),
    db.message.findFirst({ where: { conversation: { leadId }, direction: 'OUTBOUND', senderType: { in: ['AI', 'HUMAN'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    db.buyingSignal.findMany({ where: { leadId, createdAt: { gte: since } }, select: { type: true, confidence: true } }),
    db.intentEvent.findMany({ where: { leadId, createdAt: { gte: since } }, select: { type: true, confidence: true } }),
    db.task.count({ where: { leadId, status: 'OPEN' } }),
    db.task.count({ where: { leadId, status: 'OPEN', dueAt: { lt: new Date() } } }),
    db.leadActivity.count({ where: { leadId, OR: [{ type: 'SIMULATION', actorType: { in: ['USER', 'AI'] } }, { type: 'NOTE', description: { contains: 'simula', mode: 'insensitive' } }] } }),
    lead.city ? db.pJ.count({ where: { organizationId: orgId, active: true, OR: [{ city: { equals: lead.city, mode: 'insensitive' } }, { citiesServed: { has: lead.city } }] } }) : Promise.resolve(0),
    lead.consultantId ? db.lead.count({ where: { consultantId: lead.consultantId, deletedAt: null, status: { in: ['ASSIGNED', 'IN_CONVERSATION', 'QUALIFIED', 'OPPORTUNITY'] } } }) : Promise.resolve(0),
    lead.consultantId ? db.opportunity.count({ where: { consultantId: lead.consultantId, status: 'OPEN' } }) : Promise.resolve(0),
  ]);
  return { lead, inbound, outbound, lastHumanOrAi, buying, intents, openTasks, overdueTasks, simSent: simSent > 0, cityServed: served > 0, consultantLeads, consultantOpps };
}

/**
 * Recalcula sub-scores, ciclo de vida e a Next Best Action do lead.
 * Chamado pelos assinantes do Event Bus (mensagem, simulação, distribuição, oportunidade…) e por job.
 */
export async function refreshLeadIntelligence(orgId: string, leadId: string, now = new Date()) {
  const data = await gatherInputs(orgId, leadId);
  if (!data) return null;
  const { lead } = data;
  const settings = await getOrgSettings(orgId);
  const sub = computeSubScores(
    {
      product: lead.product,
      desiredValue: lead.desiredValue,
      city: lead.city,
      objective: lead.objective,
      term: lead.term,
      email: lead.email,
      phone: lead.phone,
      intent: lead.intent,
      optOut: lead.optOut,
      signals: lead.signals as never,
      cityServed: data.cityServed,
      inboundMessages: data.inbound,
      outboundMessages: data.outbound,
      buyingSignals: data.buying,
      intentEvents: data.intents,
      lastInteractionAt: lead.lastInteractionAt,
      lastSignalAt: lead.lastSignalAt,
      createdAt: lead.createdAt,
    },
    settings.intelligence,
    now
  );

  const closed = ['CONVERTED', 'LOST', 'BLOCKED'].includes(lead.status);
  const lifecycle = closed ? lead.lifecycle : sub.lifecycle;
  const wasDormant = lead.lifecycle === 'NURTURE' || lead.lifecycle === 'REACTIVATION' || lead.lifecycle === 'DORMANT';
  const reactivated = wasDormant && lifecycle === 'ACTIVE' && !!lead.lastSignalAt && now.getTime() - lead.lastSignalAt.getTime() < DAY;

  await db.lead.update({
    where: { id: lead.id },
    data: { fitScore: sub.fit, intentScore: sub.intent, engagementScore: sub.engagement, behaviorScore: sub.behavior, recencyScore: sub.recency, lifecycle },
  });

  if (reactivated) {
    await db.intentEvent.create({ data: { organizationId: orgId, leadId, type: 'RENEWED_INTEREST', evidence: `Novo sinal após período em ${lead.lifecycle === 'NURTURE' ? 'nutrição' : 'reativação'}`, confidence: 0.8, origin: 'RULE' } });
    await db.leadActivity.create({ data: { organizationId: orgId, leadId, type: 'STATUS_CHANGED', description: 'Lead reaquecido: voltou a interagir após período inativo', actorType: 'SYSTEM', metadata: { from: lead.lifecycle, to: 'ACTIVE' } } });
    await publish(orgId, 'lead.reactivated', { leadId, from: lead.lifecycle, consultantId: lead.consultantId });
  }

  // Next Best Action
  const conv = lead.conversations[0];
  const lastMsg = conv?.messages[0];
  const awaitingReplyMinutes = lastMsg && lastMsg.direction === 'INBOUND' ? (now.getTime() - lastMsg.createdAt.getTime()) / 60_000 : null;
  const opp = lead.opportunities[0];
  const capacity = lead.consultant
    ? assessCapacity(
        { maxOpenLeads: lead.consultant.maxOpenLeads, maxOpenOpportunities: lead.consultant.maxOpenOpportunities, activeLeads: data.consultantLeads, activeOpportunities: data.consultantOpps, available: lead.consultant.available, active: lead.consultant.active, workingHours: lead.consultant.workingHours as never },
        now,
        settings.capacity
      ).state
    : null;
  const pref = lead.preference;
  const recs = recommend(
    {
      lead: { status: lead.status, temperature: lead.temperature, intent: lead.intent, consultantId: lead.consultantId, optOut: lead.optOut, consentStatus: lead.consentStatus, product: lead.product, desiredValue: lead.desiredValue, city: lead.city, preferredChannel: lead.preferredChannel, lifecycle, signals: lead.signals as never },
      priorityIndex: sub.priorityIndex,
      awaitingReplyMinutes,
      conversationMode: conv?.mode ?? null,
      lastContactHoursAgo: data.lastHumanOrAi ? (now.getTime() - data.lastHumanOrAi.createdAt.getTime()) / 3_600_000 : null,
      hasOpenOpportunity: !!opp,
      opportunityHealth: opp?.health ?? null,
      opportunityStageKey: opp?.stage.key ?? null,
      openTasks: data.openTasks,
      overdueTasks: data.overdueTasks,
      simulationSent: data.simSent,
      recentIntents: [...new Set(data.intents.map((i) => i.type))],
      recentSignals: [...new Set(data.buying.map((b) => b.type))],
      objections: lead.memory?.objections ?? [],
      leadQuietHours: pref?.quietHoursStart != null && pref?.quietHoursEnd != null ? { start: pref.quietHoursStart, end: pref.quietHoursEnd } : null,
      consultantCapacity: capacity,
    },
    now
  );
  await persistNba(orgId, lead.id, opp?.id ?? null, lead.consultantId, recs[0] ?? null);
  return { subScores: sub, recommendations: recs, lifecycle, reactivated };
}

/** Mantém uma única NBA aberta: se a ação mudou, a anterior vira SUPERSEDED. */
async function persistNba(orgId: string, leadId: string, opportunityId: string | null, consultantId: string | null, rec: NbaRecommendation | null) {
  const open = await db.nextBestAction.findFirst({ where: { leadId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  if (!rec) {
    if (open) await db.nextBestAction.update({ where: { id: open.id }, data: { status: 'SUPERSEDED', resolvedAt: new Date() } });
    return null;
  }
  if (open && open.action === rec.action && open.priority === rec.priority && open.validUntil > new Date()) {
    return db.nextBestAction.update({ where: { id: open.id }, data: { reason: rec.reason, signals: rec.signals as object, confidence: rec.confidence, validUntil: rec.validUntil, recommendedAt: rec.recommendedAt } });
  }
  if (open) await db.nextBestAction.update({ where: { id: open.id }, data: { status: 'SUPERSEDED', resolvedAt: new Date() } });
  const created = await db.nextBestAction.create({
    data: {
      organizationId: orgId,
      leadId,
      opportunityId,
      action: rec.action,
      priority: rec.priority,
      reason: rec.reason,
      signals: rec.signals as object,
      confidence: rec.confidence,
      method: rec.method,
      ownerType: rec.ownerType,
      ownerId: rec.ownerType === 'CONSULTANT' ? consultantId : null,
      recommendedAt: rec.recommendedAt,
      validUntil: rec.validUntil,
    },
  });
  await db.aIEvent.create({ data: { organizationId: orgId, type: 'next_best_action.generated', payload: { leadId, action: rec.action, priority: rec.priority, nbaId: created.id } } });
  return created;
}

/** Lead DNA: visão consolidada de identidade, origem, interesse, comportamento e próxima ação. */
export async function getLeadDNA(ctx: Ctx, leadId: string) {
  assertCan(ctx, 'lead.read');
  const lead = await db.lead.findFirst({
    where: { ...leadScope(ctx), id: leadId },
    include: {
      campaign: { select: { id: true, name: true } },
      landingPage: { select: { id: true, name: true } },
      memory: true,
      preference: true,
      sources: { orderBy: { receivedAt: 'asc' }, take: 20, select: { source: true, medium: true, receivedAt: true } },
      _count: { select: { activities: true, conversations: true, opportunities: true, simulations: true, tasks: true } },
    },
  });
  if (!lead) throw NotFound('Lead');
  const [signals, intents, nba, lastActivities, sessions] = await Promise.all([
    db.buyingSignal.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.intentEvent.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.nextBestAction.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    db.leadActivity.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, description: true, createdAt: true, actorType: true } }),
    db.attributionSession.count({ where: { leadId } }),
  ]);
  const objections = [...new Set([...(lead.memory?.objections ?? []), ...intents.filter((i) => i.type === 'OBJECTION').map((i) => i.evidence.split(':')[0])])];
  return {
    identity: { name: lead.name, phone: lead.phone, email: lead.email, company: lead.company, city: lead.city, uf: lead.uf },
    origin: { source: lead.source, medium: lead.medium, campaign: lead.campaign, landingPage: lead.landingPage, utmCampaign: lead.utmCampaign, firstTouch: lead.sources[0] ?? null, touches: lead.sources.length, sessions },
    interest: { product: lead.product, objective: lead.objective, desiredValue: lead.desiredValue, term: lead.term },
    scores: { leadScore: lead.score, temperature: lead.temperature, fit: lead.fitScore, intent: lead.intentScore, engagement: lead.engagementScore, behavior: lead.behaviorScore, recency: lead.recencyScore, lifecycle: lead.lifecycle, method: 'RULE' as const },
    intent: { level: lead.intent, events: intents },
    buyingSignals: signals,
    objections,
    communication: { preferredChannel: lead.preferredChannel ?? lead.preference?.preferredChannel ?? null, consent: lead.consentStatus, optOut: lead.optOut, quietHours: lead.preference ? { start: lead.preference.quietHoursStart, end: lead.preference.quietHoursEnd } : null },
    history: { counts: lead._count, recent: lastActivities, lastInteractionAt: lead.lastInteractionAt, createdAt: lead.createdAt },
    aiSummary: lead.aiSummary ?? lead.memory?.summary ?? null,
    nextBestAction: nba.find((n) => n.status === 'OPEN') ?? null,
    nbaHistory: nba,
  };
}

export const nbaFilterSchema = z.object({
  priority: z.string().optional(),
  action: z.string().optional(),
  pjId: z.string().optional(),
  consultantId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

/** Fila de próximas ações abertas no escopo do usuário (para Cockpit / Inteligência). */
export async function listOpenNba(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'lead.read');
  const f = nbaFilterSchema.parse(raw ?? {});
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const items = await db.nextBestAction.findMany({
    where: {
      organizationId: ctx.orgId,
      status: 'OPEN',
      validUntil: { gt: new Date() },
      ...(f.priority ? { priority: f.priority } : {}),
      ...(f.action ? { action: f.action } : {}),
      lead: { ...leadScope(ctx), ...(f.pjId ? { pjId: f.pjId } : {}), ...(f.consultantId ? { consultantId: f.consultantId } : {}) },
    },
    include: { lead: { select: { id: true, name: true, temperature: true, score: true, product: true, consultant: { select: { name: true } }, pj: { select: { code: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return items.sort((a, b) => order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order] || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, f.take);
}

export async function resolveNba(ctx: Ctx, id: string, status: 'DONE' | 'DISMISSED') {
  assertCan(ctx, 'lead.update');
  const nba = await db.nextBestAction.findFirst({ where: { id, organizationId: ctx.orgId, lead: leadScope(ctx) } });
  if (!nba) throw NotFound('Próxima ação');
  await db.nextBestAction.update({ where: { id }, data: { status, resolvedAt: new Date(), resolvedBy: ctx.userId } });
  await db.leadActivity.create({ data: { organizationId: ctx.orgId, leadId: nba.leadId, type: 'NOTE', description: `Próxima ação "${nba.action}" marcada como ${status === 'DONE' ? 'feita' : 'descartada'}`, actorType: 'USER', actorId: ctx.userId } });
  await audit(ctx, 'nba.resolved', { type: 'NextBestAction', id }, { status, action: nba.action });
  return { ok: true };
}

/** Job: recalcula leads ativos com sinais/interações recentes e aplica decaimento aos parados. */
export async function refreshIntelligenceBatch(orgId: string, opts: { limit?: number } = {}) {
  const leads = await db.lead.findMany({
    where: { organizationId: orgId, deletedAt: null, status: { notIn: ['CONVERTED', 'BLOCKED'] } },
    orderBy: { updatedAt: 'desc' },
    take: opts.limit ?? 500,
    select: { id: true },
  });
  let reactivated = 0;
  for (const l of leads) {
    const r = await refreshLeadIntelligence(orgId, l.id);
    if (r?.reactivated) reactivated++;
  }
  await db.nextBestAction.updateMany({ where: { organizationId: orgId, status: 'OPEN', validUntil: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  return { refreshed: leads.length, reactivated };
}
