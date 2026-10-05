import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';

// PROMPT VERSIONING — DRAFT → TESTING → ACTIVE → ARCHIVED.
// Só a versão ACTIVE vai para produção (é copiada para AIAgent.instructions/model/temperature).
// O AI Lab testa qualquer versão sem mexer em produção.

export const promptInput = z.object({
  agentKey: z.enum(['PROSPECT', 'QUALIFICATION']),
  instructions: z.string().min(10).max(8000),
  model: z.string().max(80).nullable().optional(),
  temperature: z.coerce.number().min(0).max(1).nullable().optional(),
  changeNote: z.string().max(300).optional(),
});

/** Garante que exista a v1 espelhando o prompt atual do agente (migração transparente da V1). */
export async function ensureBaselineVersions(orgId: string) {
  const agents = await db.aIAgent.findMany({ where: { organizationId: orgId, key: { in: ['PROSPECT', 'QUALIFICATION'] } } });
  for (const a of agents) {
    const has = await db.aIPromptVersion.count({ where: { organizationId: orgId, agentKey: a.key } });
    if (!has) await db.aIPromptVersion.create({ data: { organizationId: orgId, agentKey: a.key, version: 1, instructions: a.instructions, model: a.model, temperature: a.temperature, status: 'ACTIVE', changeNote: 'Versão inicial (V1)', authorName: 'Sistema', publishedAt: new Date() } });
  }
}

export async function listPromptVersions(ctx: Ctx, agentKey?: string) {
  assertCan(ctx, 'ai.read');
  await ensureBaselineVersions(ctx.orgId);
  return db.aIPromptVersion.findMany({ where: { organizationId: ctx.orgId, ...(agentKey ? { agentKey } : {}) }, orderBy: [{ agentKey: 'asc' }, { version: 'desc' }] });
}

export async function createPromptVersion(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'ai.configure');
  const input = promptInput.parse(raw);
  await ensureBaselineVersions(ctx.orgId);
  const last = await db.aIPromptVersion.findFirst({ where: { organizationId: ctx.orgId, agentKey: input.agentKey }, orderBy: { version: 'desc' } });
  const v = await db.aIPromptVersion.create({ data: { organizationId: ctx.orgId, agentKey: input.agentKey, version: (last?.version ?? 0) + 1, instructions: input.instructions, model: input.model ?? null, temperature: input.temperature ?? null, changeNote: input.changeNote, status: 'DRAFT', authorId: ctx.userId, authorName: ctx.userName } });
  await audit(ctx, 'prompt.changed', { type: 'AIPromptVersion', id: v.id }, { agentKey: v.agentKey, version: v.version, action: 'created' });
  return v;
}

export async function setPromptStatus(ctx: Ctx, id: string, status: 'DRAFT' | 'TESTING' | 'ACTIVE' | 'ARCHIVED') {
  assertCan(ctx, 'ai.configure');
  const v = await db.aIPromptVersion.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!v) throw NotFound('Versão de prompt');
  if (v.status === 'ACTIVE' && status !== 'ACTIVE') {
    const others = await db.aIPromptVersion.count({ where: { organizationId: ctx.orgId, agentKey: v.agentKey, status: 'ACTIVE', NOT: { id } } });
    if (!others) throw BadRequest('Publique outra versão antes de tirar esta de produção.');
  }
  await db.$transaction(async (tx) => {
    if (status === 'ACTIVE') {
      await tx.aIPromptVersion.updateMany({ where: { organizationId: ctx.orgId, agentKey: v.agentKey, status: 'ACTIVE', NOT: { id } }, data: { status: 'ARCHIVED' } });
      await tx.aIAgent.updateMany({ where: { organizationId: ctx.orgId, key: v.agentKey }, data: { instructions: v.instructions, model: v.model, temperature: v.temperature } });
    }
    await tx.aIPromptVersion.update({ where: { id }, data: { status, ...(status === 'ACTIVE' ? { publishedAt: new Date() } : {}) } });
  });
  await db.configHistory.create({ data: { organizationId: ctx.orgId, area: 'prompt', before: { agentKey: v.agentKey, version: v.version, status: v.status }, after: { status }, actorId: ctx.userId, actorName: ctx.userName } });
  await audit(ctx, 'prompt.changed', { type: 'AIPromptVersion', id }, { agentKey: v.agentKey, version: v.version, from: v.status, to: status });
  return { ok: true };
}

export async function activePromptVersion(orgId: string, agentKey: string) {
  return db.aIPromptVersion.findFirst({ where: { organizationId: orgId, agentKey, status: 'ACTIVE' }, orderBy: { version: 'desc' }, select: { version: true } });
}
