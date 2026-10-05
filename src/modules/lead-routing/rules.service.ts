import { z } from 'zod';
import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';

// Routing Rule Builder: SE produto = X E região = Y ENTÃO PJs = [...] · Método · Capacidade
export const ROUTING_METHODS = {
  ROUND_ROBIN: 'Round Robin',
  EQUAL_SPLIT: 'Divisão igual',
  LEAST_LOAD: 'Menor carga',
  PRIORITY: 'Prioridade do consultor',
  SPECIFIC_CONSULTANT: 'Consultor específico',
} as const;

export const ruleInput = z.object({
  name: z.string().min(3).max(120),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  active: z.boolean().default(true),
  conditions: z.object({
    products: z.array(z.string()).default([]),
    regionIds: z.array(z.string()).default([]),
    cities: z.array(z.string()).default([]),
    ufs: z.array(z.string()).default([]),
    sources: z.array(z.string()).default([]),
    minScore: z.coerce.number().int().min(0).max(100).nullable().optional(),
  }),
  pjIds: z.array(z.string()).default([]),
  method: z.enum(['EQUAL_SPLIT', 'ROUND_ROBIN', 'LEAST_LOAD', 'PRIORITY', 'SPECIFIC_CONSULTANT']),
  consultantId: z.string().nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(1000).nullable().optional(),
});

export async function listRules(ctx: Ctx) {
  assertCan(ctx, 'routing.read');
  return db.routingRule.findMany({ where: { organizationId: ctx.orgId }, orderBy: [{ active: 'desc' }, { priority: 'asc' }] });
}

export async function saveRule(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'routing.configure');
  const input = ruleInput.parse(raw);
  const conditions = Object.fromEntries(Object.entries(input.conditions).filter(([, v]) => (Array.isArray(v) ? v.length : v != null)));
  const data = { ...input, conditions, consultantId: input.method === 'SPECIFIC_CONSULTANT' ? input.consultantId : null };
  const rule = id ? await db.routingRule.update({ where: { id, organizationId: ctx.orgId }, data }) : await db.routingRule.create({ data: { organizationId: ctx.orgId, ...data } });
  await audit(ctx, 'routing.changed', { type: 'RoutingRule', id: rule.id }, { action: id ? 'updated' : 'created', ...data });
  return rule;
}

export async function deleteRule(ctx: Ctx, id: string) {
  assertCan(ctx, 'routing.configure');
  await db.routingRule.deleteMany({ where: { id, organizationId: ctx.orgId } });
  await audit(ctx, 'routing.changed', { type: 'RoutingRule', id }, { action: 'deleted' });
}
