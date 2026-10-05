import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { NotFound } from '@/lib/errors';
import { normalizeName, normalizeUf } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope } from './scope';
import { assertTransition } from './state-machine';
import { type LeadStatusKey, statusLabel } from './catalog';
import { assertProduct } from '../products/product.service';
import { rescoreLead } from '../lead-scoring/scoring.service';

export const leadFilterSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  temperature: z.string().optional(),
  landingHeat: z.enum(['MORNO', 'QUENTE', 'ANY']).optional(),
  source: z.string().optional(),
  product: z.string().optional(),
  pjId: z.string().optional(),
  consultantId: z.string().optional(),
  campaignId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['recent', 'score', 'value', 'name']).default('recent'),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

export function leadWhere(ctx: Ctx, f: Partial<LeadFilters>): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { ...leadScope(ctx) };
  if (f.status) where.status = f.status as LeadStatusKey;
  if (f.temperature) where.temperature = f.temperature;
  if (f.source === 'GOOGLE_ALL') where.source = { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] };
  else if (f.source) where.source = f.source;
  if (f.landingHeat === 'ANY') where.landingHeat = { not: null };
  else if (f.landingHeat) where.landingHeat = f.landingHeat;
  if (f.product) where.product = f.product;
  if (f.pjId) where.pjId = f.pjId;
  if (f.consultantId) where.consultantId = f.consultantId;
  if (f.campaignId) where.campaignId = f.campaignId;
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.q) {
    // Busca por telefone/CNPJ só quando o texto parece um número ("(11) 9999-0000"), não quando tem letras.
    const looksNumeric = /^[\d\s()+\-./]+$/.test(f.q.trim());
    const digits = looksNumeric ? f.q.replace(/\D/g, '') : '';
    where.OR = [
      { name: { contains: f.q, mode: 'insensitive' } },
      { email: { contains: f.q.toLowerCase() } },
      { company: { contains: f.q, mode: 'insensitive' } },
      { city: { contains: f.q, mode: 'insensitive' } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { cnpj: { contains: digits } }] : []),
      ...(/^\d+$/.test(f.q) ? [{ code: Number(f.q) }] : []),
    ];
  }
  return where;
}

export async function listLeads(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'lead.read');
  const f = leadFilterSchema.parse(raw ?? {});
  const where = leadWhere(ctx, f);
  const orderBy: Prisma.LeadOrderByWithRelationInput =
    f.sort === 'score' ? { score: 'desc' } : f.sort === 'value' ? { desiredValue: { sort: 'desc', nulls: 'last' } } : f.sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' };
  const [items, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { consultant: { select: { id: true, name: true } }, pj: { select: { id: true, code: true, name: true } }, campaign: { select: { id: true, name: true } } },
    }),
    db.lead.count({ where }),
  ]);
  return { items, total, page: f.page, pageSize: f.pageSize };
}

/** Tudo que a tela do lead precisa, em poucas consultas. */
export async function getLeadDetail(ctx: Ctx, id: string) {
  assertCan(ctx, 'lead.read');
  const lead = await db.lead.findFirst({
    where: { ...leadScope(ctx), id },
    include: {
      pj: true,
      consultant: true,
      campaign: true,
      landingPage: { select: { id: true, name: true, slug: true } },
      scoreSnapshot: true,
      scoreEvents: { orderBy: { createdAt: 'desc' }, take: 30 },
      activities: { orderBy: { createdAt: 'desc' }, take: 60 },
      sources: { orderBy: { receivedAt: 'desc' } },
      merges: { orderBy: { mergedAt: 'desc' } },
      memory: true,
      consents: { orderBy: { createdAt: 'desc' } },
      preference: true,
      tasks: { where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' } },
      simulations: { orderBy: { createdAt: 'desc' }, take: 5 },
      opportunities: { include: { stage: true, consultant: true }, orderBy: { createdAt: 'desc' } },
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 80 }, summaries: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  });
  if (!lead) throw NotFound('Lead');
  const [decisions, attribution] = await Promise.all([
    db.routingDecision.findMany({ where: { organizationId: ctx.orgId, leadId: id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    db.attributionSession.findFirst({ where: { organizationId: ctx.orgId, leadId: id }, orderBy: { firstSeenAt: 'asc' } }),
  ]);
  return { ...lead, decisions, attribution };
}

export const leadUpdateSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  company: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  uf: z.string().max(2).nullable().optional(),
  product: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Produto inválido.').nullable().optional(),
  objective: z.string().max(200).nullable().optional(),
  desiredValue: z.coerce.number().int().min(0).nullable().optional(),
  term: z.string().max(80).nullable().optional(),
});

export async function updateLead(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, 'lead.update');
  const input = leadUpdateSchema.parse(raw);
  await assertProduct(ctx.orgId, input.product);
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id } });
  if (!lead) throw NotFound('Lead');
  const data = {
    ...input,
    ...(input.name ? { name: normalizeName(input.name) } : {}),
    ...(input.city ? { city: normalizeName(input.city) } : {}),
    ...(input.uf !== undefined ? { uf: normalizeUf(input.uf) } : {}),
  };
  await db.lead.update({ where: { id }, data });
  await db.leadActivity.create({
    data: { organizationId: ctx.orgId, leadId: id, type: 'UPDATED', description: `Dados atualizados: ${Object.keys(input).join(', ')}`, actorType: 'USER', actorId: ctx.userId },
  });
  await audit(ctx, 'lead.updated', { type: 'Lead', id }, { fields: Object.keys(input) });
  await publish(ctx.orgId, 'lead.updated', { leadId: id, fields: Object.keys(input) });
  await rescoreLead(ctx, id, { reason: 'Dados atualizados manualmente' });
  return db.lead.findUniqueOrThrow({ where: { id } });
}

export async function changeLeadStatus(ctx: Ctx, id: string, status: LeadStatusKey, reason?: string) {
  assertCan(ctx, 'lead.update');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id } });
  if (!lead) throw NotFound('Lead');
  assertTransition(lead.status as LeadStatusKey, status);
  await db.lead.update({ where: { id }, data: { status, ...(status === 'LOST' ? { lostReason: reason ?? null } : {}) } });
  await db.leadActivity.create({
    data: {
      organizationId: ctx.orgId,
      leadId: id,
      type: 'STATUS_CHANGED',
      description: `${statusLabel(lead.status)} → ${statusLabel(status)}${reason ? ` · ${reason}` : ''}`,
      actorType: ctx.via === 'system' ? 'SYSTEM' : 'USER',
      actorId: ctx.userId,
    },
  });
  await audit(ctx, 'lead.status_changed', { type: 'Lead', id }, { from: lead.status, to: status, reason });
  await publish(ctx.orgId, 'lead.updated', { leadId: id, status });
}

export async function addLeadNote(ctx: Ctx, id: string, text: string) {
  assertCan(ctx, 'activity.create');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id } });
  if (!lead) throw NotFound('Lead');
  return db.leadActivity.create({
    data: { organizationId: ctx.orgId, leadId: id, type: 'NOTE', description: text.slice(0, 2000), actorType: 'USER', actorId: ctx.userId, metadata: { author: ctx.userName } },
  });
}

export async function deleteLead(ctx: Ctx, id: string) {
  assertCan(ctx, 'lead.delete');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id } });
  if (!lead) throw NotFound('Lead');
  await db.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, 'lead.deleted', { type: 'Lead', id });
}
