import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { DomainEventEnvelope } from '@/lib/events';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { notifyConsultant, notifyRoles } from '../notifications/notification.service';

// AUTOMATION ENGINE — Trigger → Condition → Action.
// Ações disponíveis são internas e não invasivas (notificar, criar tarefa/oportunidade).
// Não existe ação de envio em massa de mensagens.

export const CONDITION_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] as const;
export const ACTION_TYPES = {
  notify_consultant: 'Notificar consultor responsável',
  notify_role: 'Notificar perfis (ex.: gestores)',
  create_task: 'Criar tarefa',
  create_opportunity: 'Criar oportunidade',
} as const;

export const conditionSchema = z.object({ field: z.string(), op: z.enum(CONDITION_OPS), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) });
export const actionSchema = z.object({ type: z.enum(Object.keys(ACTION_TYPES) as [keyof typeof ACTION_TYPES]), params: z.record(z.unknown()).default({}) });
export const ruleInput = z.object({
  name: z.string().min(3).max(120),
  trigger: z.string(),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
  active: z.boolean().default(true),
});

type Condition = z.infer<typeof conditionSchema>;

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function evaluateCondition(c: Condition, context: unknown): boolean {
  const v = get(context, c.field);
  switch (c.op) {
    case 'eq':
      return String(v) === String(c.value);
    case 'neq':
      return String(v) !== String(c.value);
    case 'gt':
      return Number(v) > Number(c.value);
    case 'gte':
      return Number(v) >= Number(c.value);
    case 'lt':
      return Number(v) < Number(c.value);
    case 'lte':
      return Number(v) <= Number(c.value);
    case 'in':
      return (Array.isArray(c.value) ? c.value : String(c.value).split(',')).map((x) => x.trim()).includes(String(v));
    case 'contains':
      return String(v ?? '').toLowerCase().includes(String(c.value).toLowerCase());
  }
}

export async function runAutomations(event: DomainEventEnvelope) {
  const rules = await db.automationRule.findMany({ where: { organizationId: event.orgId, trigger: event.name, active: true } });
  if (!rules.length) return;
  const leadId = (event.payload as { leadId?: string }).leadId;
  const lead = leadId ? await db.lead.findUnique({ where: { id: leadId } }) : null;
  const context = { event: event.payload, lead };
  const ctx = systemCtx(event.orgId, 'Automação');

  for (const rule of rules) {
    const conditions = (rule.conditions ?? []) as Condition[];
    if (!conditions.every((c) => evaluateCondition(c, context))) continue;
    const actions = (rule.actions ?? []) as z.infer<typeof actionSchema>[];
    for (const action of actions) {
      try {
        await executeAction(ctx, action, lead, rule.name);
      } catch (e) {
        logger.error('automation.action_failed', { rule: rule.id, action: action.type, error: String(e) });
      }
    }
    await db.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
  }
}

async function executeAction(ctx: Ctx, action: z.infer<typeof actionSchema>, lead: { id: string; name: string; consultantId: string | null; status: string } | null, ruleName: string) {
  const p = action.params as Record<string, string | number | string[]>;
  const title = String(p.title ?? ruleName).replace('{lead}', lead?.name ?? '');
  switch (action.type) {
    case 'notify_consultant':
      if (lead?.consultantId) await notifyConsultant(ctx.orgId, lead.consultantId, { type: 'automation', title, body: `Automação: ${ruleName}`, link: lead ? `/leads/${lead.id}` : undefined });
      break;
    case 'notify_role':
      await notifyRoles(ctx.orgId, (p.roles as string[]) ?? ['MANAGER'], { type: 'automation', title, body: `Automação: ${ruleName}`, link: lead ? `/leads/${lead.id}` : undefined });
      break;
    case 'create_task': {
      if (!lead) return;
      const { createTask } = await import('../tasks/task.service');
      await createTask(ctx, { type: String(p.taskType ?? 'CONTACT'), title, leadId: lead.id, dueAt: new Date(Date.now() + Number(p.dueInHours ?? 4) * 3600_000), priority: String(p.priority ?? 'HIGH') }, 'AUTOMATION');
      break;
    }
    case 'create_opportunity': {
      if (!lead || ['OPPORTUNITY', 'CONVERTED', 'BLOCKED', 'LOST'].includes(lead.status)) return;
      const open = await db.opportunity.count({ where: { leadId: lead.id, status: 'OPEN' } });
      if (open) return;
      const { createOpportunity } = await import('../opportunities/opportunity.service');
      await createOpportunity(ctx, { leadId: lead.id });
      break;
    }
  }
}

export async function listRules(ctx: Ctx) {
  assertCan(ctx, 'automation.manage');
  return db.automationRule.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'asc' } });
}

export async function saveRule(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'automation.manage');
  const input = ruleInput.parse(raw);
  const data = { ...input, conditions: input.conditions as object, actions: input.actions as object };
  const rule = id
    ? await db.automationRule.update({ where: { id, organizationId: ctx.orgId }, data })
    : await db.automationRule.create({ data: { organizationId: ctx.orgId, ...data } });
  await audit(ctx, 'settings.changed', { type: 'AutomationRule', id: rule.id }, { name: rule.name });
  return rule;
}

export async function toggleRule(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, 'automation.manage');
  await db.automationRule.updateMany({ where: { id, organizationId: ctx.orgId }, data: { active } });
}
