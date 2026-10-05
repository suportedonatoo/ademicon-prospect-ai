import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { PRODUCTS, SOURCES } from '../leads/catalog';

/** Opções para os filtros globais (respeitando o escopo do usuário). */
export async function filterOptions(ctx: Ctx) {
  const [regions, pjs, consultants, campaigns] = await Promise.all([
    db.region.findMany({ where: { organizationId: ctx.orgId }, select: { name: true }, orderBy: { name: 'asc' } }),
    db.pJ.findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope !== 'ORG' && ctx.pjId ? { id: ctx.pjId } : {}) }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } }),
    db.consultant.findMany({
      where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '' } : {}), ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '' } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.campaign.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    period: [
      { value: '7d', label: 'Últimos 7 dias' },
      { value: '30d', label: 'Últimos 30 dias' },
      { value: '90d', label: 'Últimos 90 dias' },
      { value: '365d', label: 'Últimos 12 meses' },
    ],
    region: regions.map((r) => ({ value: r.name, label: r.name })),
    pjId: pjs.map((p) => ({ value: p.id, label: `${p.code} · ${p.city}` })),
    consultantId: consultants.map((c) => ({ value: c.id, label: c.name })),
    product: (await db.product.findMany({ where: { organizationId: ctx.orgId, status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } })).map((p) => ({ value: p.key, label: p.name })).concat(
      (await db.product.count({ where: { organizationId: ctx.orgId } })) ? [] : Object.entries(PRODUCTS).map(([value, label]) => ({ value, label }))
    ),
    source: Object.entries(SOURCES).map(([value, label]) => ({ value, label })),
    campaignId: campaigns.map((c) => ({ value: c.id, label: c.name })),
  };
}

export function globalFilterFields(o: Awaited<ReturnType<typeof filterOptions>>) {
  return [
    { name: 'period', label: 'Últimos 30 dias', options: o.period.filter((p) => p.value !== '30d') },
    { name: 'region', label: 'Região', options: o.region },
    { name: 'pjId', label: 'PJ', options: o.pjId },
    { name: 'consultantId', label: 'Consultor', options: o.consultantId },
    { name: 'product', label: 'Produto', options: o.product },
    { name: 'source', label: 'Origem', options: o.source },
    { name: 'campaignId', label: 'Campanha', options: o.campaignId },
  ];
}
