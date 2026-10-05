import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { notifyConsultant, notifyRoles } from '../notifications/notification.service';
import { advance, playbookVersionInput, selectPlaybook, stepSchema, type LeadFacts, type PlaybookActionType, type PlaybookStep } from './playbook-engine';

// PLAYBOOKS COMERCIAIS — versões (DRAFT → ACTIVE → ARCHIVED), seleção por segmento e execução.
// Uma execução por lead e playbook; mudança de segmento (ex.: esquentou) cancela a anterior.

export async function listPlaybooks(ctx: Ctx) {
  assertCan(ctx, 'ai.read');
  const versions = await db.playbookVersion.findMany({ where: { organizationId: ctx.orgId }, orderBy: [{ playbookKey: 'asc' }, { version: 'desc' }] });
  const runs = await db.playbookRun.groupBy({ by: ['playbookKey', 'status'], where: { organizationId: ctx.orgId }, _count: { _all: true } });
  const keys = [...new Set(versions.map((v) => v.playbookKey))];
  return keys.map((key) => {
    const vs = versions.filter((v) => v.playbookKey === key);
    return {
      key,
      active: vs.find((v) => v.status === 'ACTIVE') ?? null,
      latest: vs[0],
      versions: vs.map((v) => ({ id: v.id, version: v.version, status: v.status, name: v.name, createdAt: v.createdAt, publishedAt: v.publishedAt })),
      runs: Object.fromEntries(runs.filter((r) => r.playbookKey === key).map((r) => [r.status, r._count._all])),
    };
  });
}

export async function getPlaybookVersion(ctx: Ctx, key: string, version?: number) {
  assertCan(ctx, 'ai.read');
  const v = await db.playbookVersion.findFirst({ where: { organizationId: ctx.orgId, playbookKey: key, ...(version ? { version } : {}) }, orderBy: { version: 'desc' } });
  if (!v) throw NotFound('Playbook');
  const runs = await db.playbookRun.findMany({ where: { organizationId: ctx.orgId, playbookKey: key }, orderBy: { startedAt: 'desc' }, take: 20 });
  return { ...v, runs };
}

/** Salvar sempre cria uma NOVA versão em rascunho (histórico preservado). */
export async function savePlaybookVersion(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'ai.configure');
  const input = playbookVersionInput.parse(raw);
  const last = await db.playbookVersion.findFirst({ where: { organizationId: ctx.orgId, playbookKey: input.playbookKey }, orderBy: { version: 'desc' }, select: { version: true } });
  const v = await db.playbookVersion.create({
    data: { organizationId: ctx.orgId, playbookKey: input.playbookKey, version: (last?.version ?? 0) + 1, name: input.name, description: input.description, segment: input.segment as object, steps: input.steps as object, priority: input.priority, authorId: ctx.userId },
  });
  await audit(ctx, 'playbook.changed', { type: 'PlaybookVersion', id: v.id }, { key: v.playbookKey, version: v.version, action: 'draft' });
  return v;
}

export async function setPlaybookStatus(ctx: Ctx, key: string, version: number, status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT') {
  assertCan(ctx, 'ai.configure');
  const v = await db.playbookVersion.findFirst({ where: { organizationId: ctx.orgId, playbookKey: key, version } });
  if (!v) throw NotFound('Versão do playbook');
  await db.$transaction(async (tx) => {
    if (status === 'ACTIVE') await tx.playbookVersion.updateMany({ where: { organizationId: ctx.orgId, playbookKey: key, status: 'ACTIVE', NOT: { id: v.id } }, data: { status: 'ARCHIVED' } });
    await tx.playbookVersion.update({ where: { id: v.id }, data: { status, ...(status === 'ACTIVE' ? { publishedAt: new Date() } : {}) } });
  });
  await db.configHistory.create({ data: { organizationId: ctx.orgId, area: 'playbook', before: { key, version, status: v.status }, after: { key, version, status }, actorId: ctx.userId, actorName: ctx.userName } });
  await audit(ctx, 'playbook.changed', { type: 'PlaybookVersion', id: v.id }, { key, version, from: v.status, to: status });
  return { ok: true };
}

async function leadFacts(orgId: string, leadId: string): Promise<(LeadFacts & { name: string; regionId: string | null }) | null> {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId: orgId, deletedAt: null }, include: { pj: { select: { regionId: true } } } });
  if (!lead) return null;
  return {
    name: lead.name,
    temperature: lead.temperature,
    product: lead.product,
    source: lead.source,
    regionId: lead.pj?.regionId ?? null,
    pjId: lead.pjId,
    consultantId: lead.consultantId,
    campaignId: lead.campaignId,
    status: lead.status,
    intent: lead.intent,
    score: lead.score,
    lifecycle: lead.lifecycle,
    optOut: lead.optOut,
    consentStatus: lead.consentStatus,
  };
}

/** Seleciona e inicia (ou troca) o playbook do lead. Chamado por eventos (distribuição, reativação, temperatura). */
export async function startPlaybookForLead(orgId: string, leadId: string, trigger: string) {
  const facts = await leadFacts(orgId, leadId);
  if (!facts || facts.optOut || ['CONVERTED', 'LOST', 'BLOCKED'].includes(facts.status)) return null;
  const active = await db.playbookVersion.findMany({ where: { organizationId: orgId, status: 'ACTIVE' } });
  const chosen = selectPlaybook(active, facts);
  if (!chosen) return null;
  const running = await db.playbookRun.findFirst({ where: { organizationId: orgId, leadId, status: { in: ['RUNNING', 'WAITING'] } } });
  if (running?.playbookKey === chosen.playbookKey) return running;
  if (running) await db.playbookRun.update({ where: { id: running.id }, data: { status: 'CANCELLED', finishedAt: new Date(), log: [...(running.log as string[]), `Cancelado: novo contexto (${trigger}) selecionou ${chosen.playbookKey}`] } });
  const run = await db.playbookRun.create({ data: { organizationId: orgId, playbookKey: chosen.playbookKey, version: chosen.version, leadId, log: [`Iniciado por ${trigger} (v${chosen.version})`] } });
  await db.leadActivity.create({ data: { organizationId: orgId, leadId, type: 'NOTE', description: `Playbook "${chosen.name}" iniciado (${trigger})`, actorType: 'SYSTEM', metadata: { playbookKey: chosen.playbookKey, version: chosen.version } } });
  return runStep(orgId, run.id);
}

/** Executa os passos até a próxima espera/fim. Idempotente por índice de passo. */
export async function runStep(orgId: string, runId: string) {
  const run = await db.playbookRun.findFirst({ where: { id: runId, organizationId: orgId } });
  if (!run || !['RUNNING', 'WAITING'].includes(run.status)) return run;
  const version = await db.playbookVersion.findFirst({ where: { organizationId: orgId, playbookKey: run.playbookKey, version: run.version } });
  const facts = await leadFacts(orgId, run.leadId);
  if (!version || !facts) return db.playbookRun.update({ where: { id: run.id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  if (facts.optOut || ['CONVERTED', 'LOST', 'BLOCKED'].includes(facts.status)) {
    return db.playbookRun.update({ where: { id: run.id }, data: { status: 'CANCELLED', finishedAt: new Date(), log: [...(run.log as string[]), `Encerrado: lead ${facts.optOut ? 'fez opt-out' : facts.status}`] } });
  }
  const steps = (version.steps as unknown[]).map((s) => stepSchema.parse(s)) as PlaybookStep[];
  const out = advance(steps, run.stepIndex, facts);
  const log = [...(run.log as string[]), ...out.log];
  for (const a of out.actions) {
    try {
      const r = await executePlaybookAction(orgId, run.leadId, facts, a.action, a.params, version.name);
      log.push(`→ ${a.action}: ${r}`);
    } catch (e) {
      log.push(`→ ${a.action}: falhou (${String(e).slice(0, 120)})`);
      logger.error('playbook.action_failed', { runId, action: a.action, error: String(e) });
    }
  }
  const updated = await db.playbookRun.update({
    where: { id: run.id },
    data: { stepIndex: out.nextIndex, status: out.status, nextRunAt: out.nextRunAt, log: log.slice(-100), ...(out.status === 'COMPLETED' || out.status === 'CANCELLED' ? { finishedAt: new Date() } : {}) },
  });
  if (out.actions.length) await publish(orgId, 'playbook.executed', { leadId: run.leadId, playbookKey: run.playbookKey, version: run.version, actions: out.actions.map((a) => a.action) });
  return updated;
}

async function executePlaybookAction(orgId: string, leadId: string, facts: LeadFacts & { name: string }, action: PlaybookActionType, params: Record<string, unknown>, playbookName: string): Promise<string> {
  const ctx = systemCtx(orgId, `Playbook: ${playbookName}`);
  const title = String(params.title ?? playbookName).replace('{lead}', facts.name);
  const link = `/leads/${leadId}`;
  switch (action) {
    case 'notify_consultant':
      if (!facts.consultantId) return 'sem consultor';
      await notifyConsultant(orgId, facts.consultantId, { type: facts.temperature === 'QUENTE' ? 'lead.hot' : 'lead.assigned', priority: facts.temperature === 'QUENTE' ? 'HIGH' : 'NORMAL', title, body: String(params.body ?? `Playbook: ${playbookName}`), link, entityType: 'Lead', entityId: leadId, dedupeKey: `pb:${leadId}:${title}` });
      return 'notificado';
    case 'notify_role':
      await notifyRoles(orgId, (params.roles as string[]) ?? ['MANAGER'], { type: 'automation', title, body: `Playbook: ${playbookName}`, link, entityType: 'Lead', entityId: leadId }, { pjId: facts.pjId });
      return 'perfis notificados';
    case 'create_task': {
      const { createTask } = await import('../tasks/task.service');
      const open = await db.task.count({ where: { leadId, status: 'OPEN', title } });
      if (open) return 'tarefa já existe';
      await createTask(ctx, { type: String(params.taskType ?? 'FOLLOW_UP'), title, leadId, dueAt: new Date(Date.now() + Number(params.dueInHours ?? 4) * 3_600_000), priority: String(params.priority ?? 'HIGH') }, 'AUTOMATION');
      return 'tarefa criada';
    }
    case 'recompute_nba': {
      const { refreshLeadIntelligence } = await import('../lead-intelligence/intelligence-v2.service');
      const r = await refreshLeadIntelligence(orgId, leadId);
      return `NBA: ${r?.recommendations[0]?.action ?? '—'}`;
    }
    case 'create_opportunity': {
      if (['OPPORTUNITY', 'CONVERTED'].includes(facts.status)) return 'já tem oportunidade';
      const open = await db.opportunity.count({ where: { leadId, status: 'OPEN' } });
      if (open) return 'já tem oportunidade';
      const { createOpportunity } = await import('../opportunities/opportunity.service');
      await createOpportunity(ctx, { leadId });
      return 'oportunidade criada';
    }
    case 'handoff_to_human': {
      const conv = await db.conversation.findFirst({ where: { leadId, organizationId: orgId, status: 'OPEN', mode: 'AI' }, orderBy: { lastMessageAt: 'desc' } });
      if (!conv) return 'sem conversa com IA';
      const { performHandoff } = await import('../ai/maestro/maestro.engine');
      await performHandoff(orgId, conv.id, String(params.reason ?? `Playbook: ${playbookName}`));
      return 'conversa transferida';
    }
    case 'send_template': {
      const { canContactProactively, deliverMessage } = await import('../messaging/messaging.service');
      const check = await canContactProactively(orgId, leadId);
      if (!check.allowed) return `não enviado: ${check.reason}`;
      const tpl = await db.messageTemplate.findFirst({ where: { organizationId: orgId, name: String(params.template ?? ''), status: 'APPROVED' } });
      if (!tpl) return 'não enviado: template inexistente ou não aprovado';
      const { getOrCreateConversation } = await import('../conversations/conversation.service');
      const { conversation: conv } = await getOrCreateConversation(orgId, leadId);
      const content = tpl.body.replace(/\{\{1\}\}/g, facts.name.split(' ')[0]);
      await deliverMessage(orgId, conv.id, { content, senderType: 'SYSTEM', senderName: `Playbook: ${playbookName}` });
      await db.leadActivity.create({ data: { organizationId: orgId, leadId, type: 'PROACTIVE_CONTACT', description: `Template "${tpl.name}" enviado pelo playbook ${playbookName}`, actorType: 'SYSTEM' } });
      return 'template enviado';
    }
  }
}

/** Job: executa playbooks cuja espera terminou. */
export async function tickPlaybooks(orgId: string, now = new Date()) {
  const due = await db.playbookRun.findMany({ where: { organizationId: orgId, status: 'WAITING', nextRunAt: { lte: now } }, take: 200, select: { id: true } });
  for (const r of due) await runStep(orgId, r.id);
  return { advanced: due.length };
}

export async function cancelRunsForLead(orgId: string, leadId: string, reason: string) {
  const runs = await db.playbookRun.findMany({ where: { organizationId: orgId, leadId, status: { in: ['RUNNING', 'WAITING'] } } });
  for (const r of runs) await db.playbookRun.update({ where: { id: r.id }, data: { status: 'CANCELLED', finishedAt: new Date(), log: [...(r.log as string[]), `Cancelado: ${reason}`] } });
  return runs.length;
}

export function validateSteps(raw: unknown) {
  const parsed = stepSchema.array().safeParse(raw);
  if (!parsed.success) throw BadRequest('Passos inválidos.');
  return parsed.data;
}
