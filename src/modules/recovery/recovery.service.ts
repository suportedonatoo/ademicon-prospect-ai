import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope, opportunityScope } from '../leads/scope';
import { getOrgSettings } from '../organizations/settings';
import { classifyRecovery, RECOVERY_QUEUE_LABEL, RECOVERY_REASON_LABEL, type RecoveryQueue, type RecoveryReason } from './recovery-engine';

// LEAD RECOVERY CENTER — encontra o que está escapando e organiza em filas de ação.

const H = 3_600_000;

export interface RecoveryItem {
  key: string;
  reason: RecoveryReason;
  reasonLabel: string;
  queue: RecoveryQueue;
  leadId: string;
  leadName: string;
  temperature: string;
  score: number;
  opportunityId?: string;
  conversationId?: string;
  lastContactAt: Date | null;
  lastInteractionAt: Date | null;
  hoursIdle: number;
  nextAction: string | null;
  owner: string | null;
  detail: string;
}

export async function recoveryCenter(ctx: Ctx) {
  assertCan(ctx, 'lead.read');
  const now = Date.now();
  const settings = await getOrgSettings(ctx.orgId);
  const scope = leadScope(ctx);
  const leadSel = { id: true, name: true, temperature: true, score: true, optOut: true, lastInteractionAt: true, lifecycle: true, intentScore: true, fitScore: true, recencyScore: true, engagementScore: true, behaviorScore: true, consultant: { select: { name: true } }, nextActions: { where: { status: 'OPEN' }, take: 1, orderBy: { createdAt: 'desc' as const }, select: { action: true } } } as const;
  const items: RecoveryItem[] = [];
  const priority = (l: { fitScore: number; intentScore: number; engagementScore: number; behaviorScore: number; recencyScore: number }) => Math.round((l.fitScore + l.intentScore * 1.2 + l.engagementScore + l.behaviorScore + l.recencyScore) / 5.2);

  // 1) Quentes não atendidos (distribuídos sem nenhuma resposta humana dentro do SLA)
  const hot = await db.lead.findMany({
    where: { ...scope, temperature: 'QUENTE', optOut: false, status: { in: ['QUALIFIED', 'ASSIGNED'] }, OR: [{ assignedAt: { lt: new Date(now - settings.sla.leadResponseMinutes * 60_000) } }, { consultantId: null, createdAt: { lt: new Date(now - settings.sla.leadResponseMinutes * 60_000) } }] },
    select: { ...leadSel, assignedAt: true, createdAt: true },
    take: 100,
  });
  for (const l of hot) {
    const since = l.assignedAt ?? l.createdAt;
    const hours = (now - since.getTime()) / H;
    items.push({ key: `hot:${l.id}`, reason: 'HOT_UNATTENDED', reasonLabel: RECOVERY_REASON_LABEL.HOT_UNATTENDED, queue: 'NOW', leadId: l.id, leadName: l.name, temperature: l.temperature, score: l.score, lastContactAt: null, lastInteractionAt: l.lastInteractionAt, hoursIdle: hours, nextAction: l.nextActions[0]?.action ?? null, owner: l.consultant?.name ?? null, detail: l.consultant ? `Distribuído há ${Math.round(hours * 60)} min sem resposta` : 'Sem consultor responsável' });
  }

  // 2) Conversas abandonadas: última mensagem é do cliente e ninguém respondeu há > 1h
  const convs = await db.conversation.findMany({
    where: { organizationId: ctx.orgId, status: 'OPEN', lastMessageAt: { lt: new Date(now - H), gt: new Date(now - 14 * 24 * H) }, lead: scope },
    select: { id: true, lastMessageAt: true, lead: { select: leadSel }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, createdAt: true } } },
    take: 200,
    orderBy: { lastMessageAt: 'desc' },
  });
  for (const c of convs) {
    if (c.messages[0]?.direction !== 'INBOUND' || c.lead.optOut) continue;
    const hours = (now - c.messages[0].createdAt.getTime()) / H;
    items.push({ key: `conv:${c.id}`, reason: 'ABANDONED_CONVERSATION', reasonLabel: RECOVERY_REASON_LABEL.ABANDONED_CONVERSATION, queue: classifyRecovery({ reason: 'ABANDONED_CONVERSATION', temperature: c.lead.temperature, hoursIdle: hours, optOut: c.lead.optOut, priorityIndex: priority(c.lead) }), leadId: c.lead.id, leadName: c.lead.name, temperature: c.lead.temperature, score: c.lead.score, conversationId: c.id, lastContactAt: null, lastInteractionAt: c.messages[0].createdAt, hoursIdle: hours, nextAction: c.lead.nextActions[0]?.action ?? null, owner: c.lead.consultant?.name ?? null, detail: `Cliente sem resposta há ${hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)} dias`}` });
  }

  // 3) Oportunidades paradas / propostas sem retorno
  const opps = await db.opportunity.findMany({
    where: { ...opportunityScope(ctx), status: 'OPEN', OR: [{ health: { in: ['STALLED', 'AT_RISK'] } }, { stage: { key: { in: ['PROPOSTA', 'NEGOCIACAO'] } }, lastActivityAt: { lt: new Date(now - 3 * 24 * H) } }] },
    select: { id: true, code: true, value: true, health: true, lastActivityAt: true, stageChangedAt: true, stage: { select: { key: true, name: true } }, lead: { select: leadSel }, consultant: { select: { name: true } } },
    take: 150,
  });
  for (const o of opps) {
    const proposal = ['PROPOSTA', 'NEGOCIACAO'].includes(o.stage.key);
    const reason: RecoveryReason = proposal ? 'PROPOSAL_NO_RETURN' : 'STALLED_OPPORTUNITY';
    const hours = (now - (o.lastActivityAt ?? o.stageChangedAt).getTime()) / H;
    items.push({ key: `opp:${o.id}`, reason, reasonLabel: RECOVERY_REASON_LABEL[reason], queue: classifyRecovery({ reason, temperature: o.lead.temperature, hoursIdle: hours, optOut: o.lead.optOut, priorityIndex: priority(o.lead) }), leadId: o.lead.id, leadName: o.lead.name, temperature: o.lead.temperature, score: o.lead.score, opportunityId: o.id, lastContactAt: o.lastActivityAt, lastInteractionAt: o.lead.lastInteractionAt, hoursIdle: hours, nextAction: o.lead.nextActions[0]?.action ?? null, owner: o.consultant?.name ?? null, detail: `#${o.code} · ${o.stage.name} · sem atividade há ${Math.round(hours / 24)} dia(s)` });
  }

  // 4) Leads reaquecidos (sinal de retorno nos últimos 3 dias depois de nutrição/reativação ou perda)
  const reheated = await db.intentEvent.findMany({ where: { organizationId: ctx.orgId, type: 'RENEWED_INTEREST', createdAt: { gte: new Date(now - 3 * 24 * H) }, lead: scope }, select: { leadId: true, createdAt: true, lead: { select: leadSel } }, orderBy: { createdAt: 'desc' }, take: 100, distinct: ['leadId'] });
  for (const r of reheated) {
    items.push({ key: `re:${r.leadId}`, reason: 'REHEATED', reasonLabel: RECOVERY_REASON_LABEL.REHEATED, queue: classifyRecovery({ reason: 'REHEATED', temperature: r.lead.temperature, hoursIdle: 0, optOut: r.lead.optOut, priorityIndex: priority(r.lead) }), leadId: r.leadId, leadName: r.lead.name, temperature: r.lead.temperature, score: r.lead.score, lastContactAt: null, lastInteractionAt: r.createdAt, hoursIdle: (now - r.createdAt.getTime()) / H, nextAction: r.lead.nextActions[0]?.action ?? null, owner: r.lead.consultant?.name ?? null, detail: 'Voltou a interagir depois de um período inativo' });
  }

  // 5) Leads esquecidos: distribuídos, sem interação há ≥ 3 dias e sem tarefa aberta
  const forgotten = await db.lead.findMany({
    where: { ...scope, optOut: false, status: { in: ['ASSIGNED', 'IN_CONVERSATION', 'QUALIFIED'] }, consultantId: { not: null }, updatedAt: { lt: new Date(now - 3 * 24 * H) }, tasks: { none: { status: 'OPEN' } } },
    select: { ...leadSel, updatedAt: true },
    orderBy: [{ score: 'desc' }],
    take: 150,
  });
  for (const l of forgotten) {
    if (items.some((i) => i.leadId === l.id)) continue;
    const last = l.lastInteractionAt ?? l.updatedAt;
    const hours = (now - last.getTime()) / H;
    items.push({ key: `fg:${l.id}`, reason: 'FORGOTTEN_LEAD', reasonLabel: RECOVERY_REASON_LABEL.FORGOTTEN_LEAD, queue: classifyRecovery({ reason: 'FORGOTTEN_LEAD', temperature: l.temperature, hoursIdle: hours, optOut: l.optOut, priorityIndex: priority(l) }), leadId: l.id, leadName: l.name, temperature: l.temperature, score: l.score, lastContactAt: null, lastInteractionAt: l.lastInteractionAt, hoursIdle: hours, nextAction: l.nextActions[0]?.action ?? null, owner: l.consultant?.name ?? null, detail: `Sem interação há ${Math.round(hours / 24)} dias e sem tarefa aberta` });
  }

  const order: Record<RecoveryQueue, number> = { NOW: 0, TODAY: 1, NURTURE: 2, NONE: 3 };
  const sorted = items.filter((i) => i.queue !== 'NONE').sort((a, b) => order[a.queue] - order[b.queue] || b.score - a.score);
  const queues = (['NOW', 'TODAY', 'NURTURE'] as const).map((q) => ({ key: q, label: RECOVERY_QUEUE_LABEL[q], items: sorted.filter((i) => i.queue === q) }));
  const byReason = Object.fromEntries(Object.keys(RECOVERY_REASON_LABEL).map((r) => [r, sorted.filter((i) => i.reason === r).length]));
  return { queues, byReason, total: sorted.length };
}

/** Ação "Recuperar": cria tarefa de contato consultivo e registra a recuperação. */
export async function executeRecovery(ctx: Ctx, leadId: string, reason: string) {
  assertCan(ctx, 'task.create');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId }, select: { id: true, name: true, consultantId: true } });
  if (!lead) throw new Error('Lead não encontrado');
  const { createTask } = await import('../tasks/task.service');
  const task = await createTask(ctx, { type: 'FOLLOW_UP', title: `Recuperar: ${lead.name}`, description: `Recovery Center · ${RECOVERY_REASON_LABEL[reason as RecoveryReason] ?? reason}`, leadId, consultantId: lead.consultantId, dueAt: new Date(Date.now() + 2 * H), priority: 'HIGH' });
  await db.leadActivity.create({ data: { organizationId: ctx.orgId, leadId, type: 'NOTE', description: `Recuperação iniciada (${RECOVERY_REASON_LABEL[reason as RecoveryReason] ?? reason})`, actorType: 'USER', actorId: ctx.userId } });
  await audit(ctx, 'recovery.executed', { type: 'Lead', id: leadId }, { reason, taskId: task.id });
  return { taskId: task.id };
}
