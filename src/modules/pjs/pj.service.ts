import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import { normalizeName, normalizePhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { OPEN_ASSIGNED_STATUSES } from '../leads/state-machine';

// Estrutura: Organização → Regiões → PJs/Unidades → Consultores (escala para 1000+ PJs: paginação e agregações).

export const pjInput = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(3).max(160),
  city: z.string().min(2).max(120),
  uf: z.string().length(2),
  regionId: z.string().nullable().optional(),
  citiesServed: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  // Landing própria da PJ (apps/landing): <subdomain>.<domínio>
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Subdomínio: letras minúsculas, números e hífen (sem espaços nem acentos).')
    .refine((s) => !RESERVED_SUBDOMAINS.includes(s), 'Subdomínio reservado.')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  landingActive: z.boolean().default(false),
  landingTitle: z.string().trim().max(120).nullable().optional(),
  landingSubtitle: z.string().trim().max(240).nullable().optional(),
  // Contato da unidade na landing (o WhatsApp/ligar da página usam estes números)
  phone: z.string().trim().max(30).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
});

const RESERVED_SUBDOMAINS = ['www', 'api', 'app', 'admin', 'gestao', 'mail', 'static', 'cdn', 'central'];

export const regionInput = z.object({ name: z.string().min(2).max(80), ufs: z.array(z.string().length(2)).default([]), cities: z.array(z.string()).default([]) });

export async function listRegions(ctx: Ctx) {
  assertCan(ctx, 'pj.read');
  return db.region.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: 'asc' }, include: { _count: { select: { pjs: true } } } });
}

export async function saveRegion(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'pj.manage');
  const input = regionInput.parse(raw);
  const data = { ...input, cities: input.cities.map(normalizeName) };
  return id ? db.region.update({ where: { id, organizationId: ctx.orgId }, data }) : db.region.create({ data: { organizationId: ctx.orgId, ...data } });
}

export async function listPjs(ctx: Ctx, opts: { q?: string; regionId?: string; page?: number; pageSize?: number } = {}) {
  assertCan(ctx, 'pj.read');
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const where = {
    organizationId: ctx.orgId,
    ...(ctx.scope !== 'ORG' && ctx.pjId ? { id: ctx.pjId } : {}),
    ...(opts.regionId ? { regionId: opts.regionId } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' as const } }, { code: { contains: opts.q, mode: 'insensitive' as const } }, { city: { contains: opts.q, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.pJ.findMany({ where, include: { region: true, _count: { select: { consultants: true } } }, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.pJ.count({ where }),
  ]);
  const ids = items.map((p) => p.id);
  const [open, total30] = await Promise.all([
    db.lead.groupBy({ by: ['pjId'], where: { pjId: { in: ids }, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['pjId'], where: { pjId: { in: ids }, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) }, deletedAt: null }, _count: { _all: true } }),
  ]);
  return {
    items: items.map((p) => ({ ...p, openLeads: open.find((o) => o.pjId === p.id)?._count._all ?? 0, leads30d: total30.find((o) => o.pjId === p.id)?._count._all ?? 0 })),
    total,
    page,
    pageSize,
  };
}

export async function getPj(ctx: Ctx, id: string) {
  assertCan(ctx, 'pj.read');
  const pj = await db.pJ.findFirst({ where: { id, organizationId: ctx.orgId }, include: { region: true, consultants: { orderBy: { name: 'asc' } } } });
  if (!pj) throw NotFound('PJ');
  return pj;
}

export async function savePj(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'pj.manage');
  const input = pjInput.parse(raw);
  const data = {
    ...input,
    city: normalizeName(input.city),
    uf: input.uf.toUpperCase(),
    citiesServed: input.citiesServed.map(normalizeName),
    subdomain: input.subdomain || null,
    landingActive: input.landingActive && !!input.subdomain,
    landingTitle: input.landingTitle || null,
    landingSubtitle: input.landingSubtitle || null,
    phone: input.phone ? normalizePhone(input.phone) : null,
    whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
    address: input.address || null,
  };
  if (input.phone && !data.phone) throw BadRequest('Telefone da unidade inválido.');
  if (input.whatsapp && !data.whatsapp) throw BadRequest('WhatsApp da unidade inválido.');
  if (data.subdomain) {
    const taken = await db.pJ.findFirst({ where: { subdomain: data.subdomain, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (taken) throw BadRequest('Este subdomínio já está em uso por outra PJ.');
    if (await db.consultant.findFirst({ where: { landingSlug: data.subdomain }, select: { id: true } })) throw BadRequest('Este subdomínio já é o link próprio de um consultor.');
  }
  const pj = id ? await db.pJ.update({ where: { id, organizationId: ctx.orgId }, data }) : await db.pJ.create({ data: { organizationId: ctx.orgId, ...data } });
  await audit(ctx, 'settings.changed', { type: 'PJ', id: pj.id }, { action: id ? 'updated' : 'created', code: pj.code });
  return pj;
}
