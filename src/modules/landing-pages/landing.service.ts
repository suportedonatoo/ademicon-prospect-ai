import { z } from 'zod';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';

export const landingInput = z.object({
  name: z.string().min(3).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Use letras minúsculas, números e hífen').min(3).max(80),
  title: z.string().min(5).max(160),
  subtitle: z.string().max(400).nullable().optional(),
  product: z.string().nullable().optional(),
  regionId: z.string().nullable().optional(),
  pjId: z.string().nullable().optional(),
  consultantId: z.string().nullable().optional(),
  ctaText: z.string().min(2).max(60).default('Simular agora'),
  imageUrl: z.string().url().nullable().optional().or(z.literal('')),
  benefits: z.array(z.object({ title: z.string().max(80), text: z.string().max(240) })).max(8).default([]),
  faq: z.array(z.object({ q: z.string().max(200), a: z.string().max(800) })).max(12).default([]),
  simulatorId: z.string().nullable().optional(),
  whatsappNumber: z.string().max(30).nullable().optional(),
  tracking: z.object({ gtmId: z.string().max(40).optional(), metaPixelId: z.string().max(40).optional() }).partial().default({}),
  seo: z.object({ title: z.string().max(70).optional(), description: z.string().max(160).optional(), noindex: z.boolean().optional() }).partial().default({}),
  form: z.object({
    fields: z.array(z.string()).default(['name', 'whatsapp', 'email', 'city']),
    requiredFields: z.array(z.string()).default(['name', 'whatsapp']),
    consentText: z.string().min(10).max(600),
  }),
});

export async function listLandings(ctx: Ctx) {
  assertCan(ctx, 'landing.read');
  const pages = await db.landingPage.findMany({ where: { organizationId: ctx.orgId }, orderBy: { updatedAt: 'desc' }, include: { simulator: { select: { name: true } } } });
  const leads = await db.lead.groupBy({ by: ['landingPageId'], where: { organizationId: ctx.orgId, landingPageId: { in: pages.map((p) => p.id) } }, _count: { _all: true } });
  return pages.map((p) => {
    const count = leads.find((l) => l.landingPageId === p.id)?._count._all ?? 0;
    return { ...p, leads: count, conversionRate: p.views ? (count / p.views) * 100 : 0 };
  });
}

export async function getLanding(ctx: Ctx, id: string) {
  assertCan(ctx, 'landing.read');
  const page = await db.landingPage.findFirst({ where: { id, organizationId: ctx.orgId }, include: { form: true } });
  if (!page) throw NotFound('Landing page');
  return page;
}

export async function saveLanding(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'landing.manage');
  const { form, ...input } = landingInput.parse(raw);
  const data = { ...input, imageUrl: input.imageUrl || null, benefits: input.benefits as object, faq: input.faq as object, tracking: input.tracking as object, seo: input.seo as object };
  const page = id
    ? await db.landingPage.update({ where: { id, organizationId: ctx.orgId }, data })
    : await db.landingPage.create({ data: { organizationId: ctx.orgId, ...data } });
  await db.landingForm.upsert({
    where: { landingPageId: page.id },
    create: { organizationId: ctx.orgId, landingPageId: page.id, ...form },
    update: form,
  });
  await audit(ctx, 'landing.changed', { type: 'LandingPage', id: page.id }, { action: id ? 'updated' : 'created', slug: page.slug });
  return page;
}

export async function setLandingStatus(ctx: Ctx, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  assertCan(ctx, 'landing.publish');
  await getLanding(ctx, id);
  await db.landingPage.update({ where: { id }, data: { status } });
  await audit(ctx, 'landing.changed', { type: 'LandingPage', id }, { status });
}

/** Página pública: somente publicadas (ou preview autenticado). */
export async function getPublicLanding(slug: string, preview = false) {
  const page = await db.landingPage.findUnique({ where: { slug }, include: { form: true, simulator: true } });
  if (!page || (!preview && page.status !== 'PUBLISHED')) return null;
  const org = await db.organization.findUnique({ where: { id: page.organizationId }, select: { name: true, settings: true } });
  return { page, org };
}
