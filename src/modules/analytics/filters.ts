import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Ctx } from '../auth/context';

// Filtros globais: Período · Região · PJ · Consultor · Produto · Origem · Campanha
export const analyticsFilterSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '365d', 'custom']).default('30d'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  region: z.string().optional(),
  pjId: z.string().optional(),
  consultantId: z.string().optional(),
  product: z.string().optional(),
  source: z.string().optional(),
  campaignId: z.string().optional(),
});
export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema> & { from: Date; to: Date };

export function resolveFilters(raw: unknown): AnalyticsFilters {
  const f = analyticsFilterSchema.parse(raw ?? {});
  const to = f.period === 'custom' && f.to ? f.to : new Date();
  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, custom: 30 }[f.period];
  const from = f.period === 'custom' && f.from ? f.from : new Date(to.getTime() - days * 86400_000);
  return { ...f, from, to };
}

/** Where do Prisma para leads (escopo do perfil + filtros). */
export function leadFilterWhere(ctx: Ctx, f: AnalyticsFilters, dateField: 'createdAt' | 'none' = 'createdAt'): Prisma.LeadWhereInput {
  return {
    organizationId: ctx.orgId,
    deletedAt: null,
    ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}),
    ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}),
    ...(dateField === 'createdAt' ? { createdAt: { gte: f.from, lte: f.to } } : {}),
    ...(f.region ? { region: f.region } : {}),
    ...(f.pjId ? { pjId: f.pjId } : {}),
    ...(f.consultantId ? { consultantId: f.consultantId } : {}),
    ...(f.product ? { product: f.product } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
  };
}

export function oppFilterWhere(ctx: Ctx, f: AnalyticsFilters, dateField: 'createdAt' | 'closedAt' = 'createdAt'): Prisma.OpportunityWhereInput {
  return {
    organizationId: ctx.orgId,
    ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}),
    ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}),
    [dateField]: { gte: f.from, lte: f.to },
    ...(f.region ? { lead: { region: f.region } } : {}),
    ...(f.pjId ? { pjId: f.pjId } : {}),
    ...(f.consultantId ? { consultantId: f.consultantId } : {}),
    ...(f.product ? { product: f.product } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
  };
}

/** Fragmento SQL equivalente (para séries temporais e agregações que o Prisma não expressa). */
export function leadSqlWhere(ctx: Ctx, f: AnalyticsFilters, alias = 'l') {
  const a = Prisma.raw(`"${alias}"`);
  const parts: Prisma.Sql[] = [Prisma.sql`${a}."organizationId" = ${ctx.orgId}`, Prisma.sql`${a}."deletedAt" IS NULL`, Prisma.sql`${a}."createdAt" BETWEEN ${f.from} AND ${f.to}`];
  if (ctx.scope === 'PJ') parts.push(Prisma.sql`${a}."pjId" = ${ctx.pjId ?? '__none__'}`);
  if (ctx.scope === 'OWN') parts.push(Prisma.sql`${a}."consultantId" = ${ctx.consultantId ?? '__none__'}`);
  if (f.region) parts.push(Prisma.sql`${a}."region" = ${f.region}`);
  if (f.pjId) parts.push(Prisma.sql`${a}."pjId" = ${f.pjId}`);
  if (f.consultantId) parts.push(Prisma.sql`${a}."consultantId" = ${f.consultantId}`);
  if (f.product) parts.push(Prisma.sql`${a}."product" = ${f.product}`);
  if (f.source) parts.push(Prisma.sql`${a}."source" = ${f.source}`);
  if (f.campaignId) parts.push(Prisma.sql`${a}."campaignId" = ${f.campaignId}`);
  return Prisma.join(parts, ' AND ');
}
