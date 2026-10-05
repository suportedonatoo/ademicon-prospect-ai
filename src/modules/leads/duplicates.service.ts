import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope } from './scope';
import { compareLeads, normalizeName, type MatchLead } from './match-engine';
import { computeMerge, registerIdentities, type IdentityKey } from './dedup';

// DUPLICATE CANDIDATES — varredura por "blocos" (mesma cidade+nome, final de telefone, usuário de
// e-mail) + comparação detalhada. Revisão humana: MESCLAR (preserva histórico) · MANTER AMBOS · IGNORAR.

const SELECT = { id: true, name: true, phone: true, email: true, cnpj: true, company: true, city: true, source: true, createdAt: true } as const;

/** Varre leads recentes procurando pares prováveis. Nunca mescla sozinho. */
export async function scanDuplicates(orgId: string, opts: { days?: number; limit?: number } = {}) {
  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
  const recent = await db.lead.findMany({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: since } }, select: SELECT, take: opts.limit ?? 1000, orderBy: { createdAt: 'desc' } });
  let found = 0;
  for (const lead of recent) {
    const first = normalizeName(lead.name).split(' ')[0];
    const tail = lead.phone ? lead.phone.slice(-8) : null;
    const local = lead.email ? lead.email.split('@')[0] : null;
    const or = [
      ...(first && first.length >= 3 && lead.city ? [{ city: { equals: lead.city, mode: 'insensitive' as const }, name: { startsWith: first, mode: 'insensitive' as const } }] : []),
      ...(tail ? [{ phone: { endsWith: tail } }] : []),
      ...(local && local.length >= 5 ? [{ email: { startsWith: `${local}@`, mode: 'insensitive' as const } }] : []),
      ...(lead.company ? [{ company: { equals: lead.company, mode: 'insensitive' as const } }] : []),
    ];
    if (!or.length) continue;
    const candidates = await db.lead.findMany({ where: { organizationId: orgId, deletedAt: null, id: { not: lead.id }, OR: or }, select: SELECT, take: 20 });
    for (const c of candidates) {
      const r = compareLeads(lead as MatchLead, c as MatchLead);
      if (r.level === 'NO_MATCH') continue;
      const [a, b] = [lead.id, c.id].sort();
      const res = await db.duplicateCandidate.upsert({
        where: { organizationId_leadAId_leadBId: { organizationId: orgId, leadAId: a, leadBId: b } },
        create: { organizationId: orgId, leadAId: a, leadBId: b, level: r.level, score: r.score, reasons: r.reasons },
        update: { level: r.level, score: r.score, reasons: r.reasons },
      });
      if (res.createdAt.getTime() > Date.now() - 5000) found++;
    }
  }
  return { scanned: recent.length, found };
}

export const dupFilter = z.object({ status: z.string().default('OPEN'), level: z.string().optional(), take: z.coerce.number().int().min(1).max(200).default(50) });

export async function listDuplicates(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'lead.read');
  const f = dupFilter.parse(raw ?? {});
  const rows = await db.duplicateCandidate.findMany({ where: { organizationId: ctx.orgId, status: f.status, ...(f.level ? { level: f.level } : {}) }, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], take: f.take * 2 });
  const ids = [...new Set(rows.flatMap((r) => [r.leadAId, r.leadBId]))];
  // Só pares em que o usuário enxerga os DOIS leads (escopo/tenant).
  const leads = await db.lead.findMany({ where: { ...leadScope(ctx), id: { in: ids } }, select: { ...SELECT, status: true, score: true, temperature: true, consultant: { select: { name: true } }, _count: { select: { activities: true, conversations: true, opportunities: true } } } });
  const byId = new Map(leads.map((l) => [l.id, l]));
  const items = rows.filter((r) => byId.has(r.leadAId) && byId.has(r.leadBId)).slice(0, f.take).map((r) => ({ ...r, a: byId.get(r.leadAId)!, b: byId.get(r.leadBId)! }));
  const counts = await db.duplicateCandidate.groupBy({ by: ['level'], where: { organizationId: ctx.orgId, status: 'OPEN' }, _count: { _all: true } });
  return { items, counts: Object.fromEntries(counts.map((c) => [c.level, c._count._all])) };
}

export const resolveInput = z.object({ action: z.enum(['MERGE', 'KEEP_BOTH', 'IGNORE']), keepId: z.string().optional() });

/**
 * MERGE: o lead "keepId" sobrevive; o outro vira histórico dele (identidades, atividades,
 * conversas, oportunidades, tarefas, simulações, sinais). O descartado é marcado como excluído
 * (soft delete) com referência ao sobrevivente — nada é apagado fisicamente.
 */
export async function resolveDuplicate(ctx: Ctx, id: string, raw: unknown) {
  const input = resolveInput.parse(raw);
  assertCan(ctx, input.action === 'MERGE' ? 'lead.update' : 'lead.read');
  const cand = await db.duplicateCandidate.findFirst({ where: { id, organizationId: ctx.orgId, status: 'OPEN' } });
  if (!cand) throw NotFound('Candidato a duplicidade');
  const pair = await db.lead.findMany({ where: { ...leadScope(ctx), id: { in: [cand.leadAId, cand.leadBId] } } });
  if (pair.length !== 2) throw NotFound('Lead');

  if (input.action !== 'MERGE') {
    await db.duplicateCandidate.update({ where: { id }, data: { status: input.action === 'KEEP_BOTH' ? 'KEPT_BOTH' : 'IGNORED', resolvedBy: ctx.userId, resolvedAt: new Date() } });
    await audit(ctx, 'duplicate.resolved', { type: 'DuplicateCandidate', id }, { action: input.action });
    return { ok: true };
  }
  if (!input.keepId || ![cand.leadAId, cand.leadBId].includes(input.keepId)) throw BadRequest('Escolha qual lead será mantido.');
  const keep = pair.find((l) => l.id === input.keepId)!;
  const drop = pair.find((l) => l.id !== input.keepId)!;
  const { data, changes } = computeMerge(keep as never, drop as never);

  await db.$transaction(async (tx) => {
    const identities = await tx.leadIdentity.findMany({ where: { leadId: drop.id } });
    await tx.leadIdentity.deleteMany({ where: { leadId: drop.id } });
    await registerIdentities(ctx.orgId, keep.id, identities.map((i) => ({ type: i.type, value: i.value }) as IdentityKey), tx);
    for (const [model, field] of [
      ['leadActivity', 'leadId'],
      ['leadSource', 'leadId'],
      ['conversation', 'leadId'],
      ['opportunity', 'leadId'],
      ['task', 'leadId'],
      ['simulation', 'leadId'],
      ['buyingSignal', 'leadId'],
      ['intentEvent', 'leadId'],
      ['consent', 'leadId'],
      ['attributionSession', 'leadId'],
      ['attributionEvent', 'leadId'],
    ] as const) {
      await (tx[model] as unknown as { updateMany: (a: object) => Promise<unknown> }).updateMany({ where: { [field]: drop.id }, data: { [field]: keep.id } });
    }
    await tx.nextBestAction.updateMany({ where: { leadId: drop.id, status: 'OPEN' }, data: { status: 'SUPERSEDED', resolvedAt: new Date() } });
    await tx.nextBestAction.updateMany({ where: { leadId: drop.id }, data: { leadId: keep.id } });
    await tx.lead.update({ where: { id: keep.id }, data: { ...data, signals: { ...((drop.signals as object) ?? {}), ...((keep.signals as object) ?? {}) }, score: Math.max(keep.score, drop.score) } });
    await tx.lead.update({ where: { id: drop.id }, data: { deletedAt: new Date(), status: 'BLOCKED', lostReason: `Mesclado em #${keep.code}` } });
    await tx.leadMerge.create({ data: { organizationId: ctx.orgId, leadId: keep.id, matchedBy: cand.level, incoming: { mergedLeadId: drop.id, code: drop.code, name: drop.name, phone: drop.phone, email: drop.email }, changes: changes as object, mergedBy: ctx.userId ?? 'SYSTEM', mergeReason: `Revisão humana (${cand.level}, ${cand.score}%): ${(cand.reasons as string[]).join('; ')}` } });
    await tx.leadActivity.create({ data: { organizationId: ctx.orgId, leadId: keep.id, type: 'MERGED', description: `Lead #${drop.code} (${drop.name}) mesclado neste registro`, actorType: 'USER', actorId: ctx.userId } });
    await tx.duplicateCandidate.update({ where: { id }, data: { status: 'MERGED', resolvedBy: ctx.userId, resolvedAt: new Date() } });
    await tx.duplicateCandidate.updateMany({ where: { organizationId: ctx.orgId, status: 'OPEN', OR: [{ leadAId: drop.id }, { leadBId: drop.id }] }, data: { status: 'IGNORED', resolvedAt: new Date() } });
  });
  await audit(ctx, 'lead.merged', { type: 'Lead', id: keep.id }, { mergedLeadId: drop.id, candidate: id, level: cand.level, changes });
  await publish(ctx.orgId, 'lead.merged', { leadId: keep.id, matchedBy: 'HUMAN_REVIEW', mergedLeadId: drop.id });
  return { ok: true, keptId: keep.id };
}
