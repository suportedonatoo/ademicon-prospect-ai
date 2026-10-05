import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import { normalizeName } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { OPEN_ASSIGNED_STATUSES } from '../leads/state-machine';
import { assertProduct } from '../products/product.service';
import { aiProfileInput, parseAiProfile } from '../ai/consultant-persona';
import { equalSplitPeriodStart } from '../lead-routing/routing-engine';
import { enterEqualSplit } from '../lead-routing/equal-split';
import { ensureLandingSlug } from './landing-link';

export const consultantInput = z.object({
  pjId: z.string(),
  name: z.string().min(3).max(120),
  email: z.string().email(),
  phone: z.string().max(30).nullable().optional(),
  products: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Produto inválido.')).default([]),
  maxOpenLeads: z.coerce.number().int().min(1).max(500).default(30),
  priority: z.coerce.number().int().min(0).max(10).default(0),
  available: z.boolean().default(true),
  active: z.boolean().default(true),
});

export async function listConsultants(ctx: Ctx, opts: { pjId?: string; q?: string } = {}) {
  assertCan(ctx, 'consultant.read');
  const consultants = await db.consultant.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}),
      ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '__none__' } : {}),
      ...(opts.pjId ? { pjId: opts.pjId } : {}),
      ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
    },
    include: { pj: { select: { id: true, code: true, name: true } }, user: { select: { id: true, email: true, lastLoginAt: true } }, _count: { select: { whatsappNumbers: true } } },
    orderBy: [{ pj: { code: 'asc' } }, { name: 'asc' }],
  });
  const ids = consultants.map((c) => c.id);
  const [open, won, month] = await Promise.all([
    db.lead.groupBy({ by: ['consultantId'], where: { consultantId: { in: ids }, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['consultantId'], where: { consultantId: { in: ids }, status: 'WON' }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['consultantId'], where: { consultantId: { in: ids }, assignedAt: { gte: equalSplitPeriodStart() }, deletedAt: null }, _count: { _all: true } }),
  ]);
  return consultants.map((c) => ({
    ...c,
    openLeads: open.find((o) => o.consultantId === c.id)?._count._all ?? 0,
    conversions: won.find((o) => o.consultantId === c.id)?._count._all ?? 0,
    monthLeads: month.find((o) => o.consultantId === c.id)?._count._all ?? 0,
    numbers: c._count.whatsappNumbers,
  }));
}

export async function saveConsultant(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'consultant.manage');
  const input = consultantInput.parse(raw);
  for (const p of input.products) await assertProduct(ctx.orgId, p);
  const pj = await db.pJ.findFirst({ where: { id: input.pjId, organizationId: ctx.orgId } });
  if (!pj) throw NotFound('PJ');
  if (ctx.scope === 'PJ' && pj.id !== ctx.pjId) throw BadRequest('Consultor precisa ser da sua PJ.');
  const data = { ...input, name: normalizeName(input.name), email: input.email.toLowerCase() };
  const before = id ? await db.consultant.findFirst({ where: { id, organizationId: ctx.orgId }, select: { active: true, pjId: true } }) : null;
  const c = id ? await db.consultant.update({ where: { id, organizationId: ctx.orgId }, data }) : await db.consultant.create({ data: { organizationId: ctx.orgId, ...data } });
  // Cadastro novo, reativação ou troca de PJ: entra na divisão igual empatado com a equipe.
  if (c.active && (!before || !before.active || before.pjId !== c.pjId)) await enterEqualSplit(ctx.orgId, c.id, c.pjId);
  if (!before) await ensureLandingSlug(c.id); // consultor novo já ganha o link próprio
  await audit(ctx, 'settings.changed', { type: 'Consultant', id: c.id }, { action: id ? 'updated' : 'created' });
  return c;
}

export async function setAvailability(ctx: Ctx, id: string, available: boolean) {
  if (ctx.consultantId !== id) assertCan(ctx, 'consultant.manage');
  await db.consultant.updateMany({ where: { id, organizationId: ctx.orgId }, data: { available } });
}

/**
 * PERFIL DO CONSULTOR: números de WhatsApp (principal + backups), IA própria e a divisão igual do mês.
 * O consultor vê o próprio perfil; gestão vê o de qualquer consultor do seu escopo.
 */
export async function getConsultantProfile(ctx: Ctx, id: string) {
  if (ctx.consultantId !== id) assertCan(ctx, 'consultant.read');
  const c = await db.consultant.findFirst({
    where: { id, organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '__none__' } : {}) },
    include: {
      pj: { select: { code: true, name: true } },
      whatsappNumbers: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, phone: true, status: true, paused: true, sentToday: true, dailyLimit: true, lastError: true } },
    },
  });
  if (!c) throw NotFound('Consultor');
  const since = equalSplitPeriodStart();
  const [monthLeads, openLeads, openConversations] = await Promise.all([
    db.lead.count({ where: { organizationId: ctx.orgId, consultantId: id, assignedAt: { gte: since }, deletedAt: null } }),
    db.lead.count({ where: { organizationId: ctx.orgId, consultantId: id, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null } }),
    db.conversation.count({ where: { organizationId: ctx.orgId, assignedConsultantId: id, status: 'OPEN' } }),
  ]);
  // Média do mês entre os consultores ativos da mesma PJ (referência da divisão igual).
  const peers = await db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, pjId: c.pjId, consultantId: { not: null }, assignedAt: { gte: since }, deletedAt: null }, _count: { _all: true } });
  const activePeers = await db.consultant.count({ where: { organizationId: ctx.orgId, pjId: c.pjId, active: true } });
  const pjMonth = peers.reduce((a, p) => a + p._count._all, 0);
  return { consultant: c, aiProfile: parseAiProfile(c.aiProfile), stats: { monthLeads, openLeads, openConversations, pjMonthAverage: activePeers ? pjMonth / activePeers : 0, since } };
}

/** IA do consultor: o próprio consultor ou a gestão podem alterar. */
export async function saveAiProfile(ctx: Ctx, id: string, raw: unknown) {
  if (ctx.consultantId !== id) assertCan(ctx, 'consultant.manage');
  const input = aiProfileInput.parse(raw);
  const c = await db.consultant.findFirst({ where: { id, organizationId: ctx.orgId, ...(ctx.scope === 'PJ' && ctx.consultantId !== id ? { pjId: ctx.pjId ?? '__none__' } : {}) }, select: { id: true } });
  if (!c) throw NotFound('Consultor');
  await db.consultant.update({ where: { id }, data: { aiProfile: input as object } });
  await audit(ctx, 'settings.changed', { type: 'Consultant', id }, { action: 'ai_profile', enabled: input.enabled });
  return input;
}
