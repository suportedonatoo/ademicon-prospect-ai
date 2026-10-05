import { QUALIFIED_LEAD_WHERE } from '../leads/catalog';
import { z } from 'zod';
import type { CampaignStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { providers } from '../integrations/registry';
import type { AdsProvider } from '../integrations/types';

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
};

export const CAMPAIGN_SOURCES = { GOOGLE_ADS: 'Google Ads', META: 'Meta Ads', INSTAGRAM: 'Instagram', WHATSAPP: 'WhatsApp', ORGANIC: 'Orgânico', EMAIL: 'E-mail', OFFLINE: 'Offline' } as const;

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE'],
  SCHEDULED: ['ACTIVE', 'PAUSED', 'DRAFT'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED'],
  COMPLETED: [],
};

export const campaignInput = z.object({
  name: z.string().min(3).max(160),
  product: z.string().nullable().optional(),
  regionId: z.string().nullable().optional(),
  pjId: z.string().nullable().optional(),
  landingPageId: z.string().nullable().optional(),
  source: z.enum(Object.keys(CAMPAIGN_SOURCES) as [string, ...string[]]),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  budget: z.coerce.number().int().min(0).default(0),
  utmCampaign: z
    .string()
    .regex(/^[a-z0-9_\-]+$/i, 'Use letras, números, _ e -')
    .max(80)
    .nullable()
    .optional(),
});

export function adsProviderFor(source: string): AdsProvider | null {
  if (source === 'GOOGLE_ADS') return providers.googleAds;
  if (source === 'META') return providers.meta;
  if (source === 'INSTAGRAM') return providers.instagram;
  return null;
}

export async function listCampaigns(ctx: Ctx, opts: { status?: string; source?: string } = {}) {
  assertCan(ctx, 'campaign.read');
  const campaigns = await db.campaign.findMany({
    where: { organizationId: ctx.orgId, ...(opts.status ? { status: opts.status as CampaignStatus } : {}), ...(opts.source ? { source: opts.source } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  const ids = campaigns.map((c) => c.id);
  const [metrics, leadCounts, qualified, opps, won] = await Promise.all([
    db.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids } }, _sum: { impressions: true, clicks: true, spend: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, deletedAt: null, ...QUALIFIED_LEAD_WHERE }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
  ]);
  return campaigns.map((c) => {
    const m = metrics.find((x) => x.campaignId === c.id)?._sum;
    const spend = m?.spend ?? 0;
    const leads = leadCounts.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const q = qualified.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const o = opps.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const w = won.find((x) => x.campaignId === c.id);
    return {
      ...c,
      impressions: m?.impressions ?? 0,
      clicks: m?.clicks ?? 0,
      spend,
      leads,
      qualified: q,
      opportunities: o,
      conversions: w?._count._all ?? 0,
      revenue: w?._sum.value ?? 0,
      cpl: leads ? spend / leads : null,
      cpql: q ? spend / q : null,
    };
  });
}

export async function getCampaign(ctx: Ctx, id: string) {
  assertCan(ctx, 'campaign.read');
  const c = await db.campaign.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 30 }, messages: { orderBy: { createdAt: 'desc' } }, audiences: true, metrics: { orderBy: { date: 'asc' } } },
  });
  if (!c) throw NotFound('Campanha');
  return c;
}

export async function saveCampaign(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, id ? 'campaign.update' : 'campaign.create');
  const input = campaignInput.parse(raw);
  if (input.startAt && input.endAt && input.endAt < input.startAt) throw BadRequest('A data de fim deve ser depois do início.');
  const campaign = id
    ? await db.campaign.update({ where: { id, organizationId: ctx.orgId }, data: input })
    : await db.campaign.create({ data: { organizationId: ctx.orgId, ...input, utmCampaign: input.utmCampaign ?? null } });
  await db.campaignEvent.create({ data: { organizationId: ctx.orgId, campaignId: campaign.id, type: id ? 'UPDATED' : 'CREATED', payload: { by: ctx.userName } } });
  await audit(ctx, 'campaign.changed', { type: 'Campaign', id: campaign.id }, { action: id ? 'updated' : 'created', name: campaign.name });
  return campaign;
}

export async function changeCampaignStatus(ctx: Ctx, id: string, status: CampaignStatus) {
  assertCan(ctx, 'campaign.update');
  const c = await getCampaign(ctx, id);
  if (!TRANSITIONS[c.status].includes(status)) throw BadRequest(`Transição inválida: ${CAMPAIGN_STATUS_LABEL[c.status]} → ${CAMPAIGN_STATUS_LABEL[status]}`);
  await db.campaign.update({ where: { id }, data: { status } });
  await db.campaignEvent.create({ data: { organizationId: ctx.orgId, campaignId: id, type: `STATUS_${status}`, payload: { from: c.status, by: ctx.userName } } });
  await audit(ctx, 'campaign.changed', { type: 'Campaign', id }, { from: c.status, to: status });
  if (status === 'ACTIVE') await publish(ctx.orgId, 'campaign.started', { campaignId: id });
  if (status === 'PAUSED') await publish(ctx.orgId, 'campaign.paused', { campaignId: id });
  if (status === 'PAUSED') await db.campaignMessage.updateMany({ where: { campaignId: id, status: { in: ['QUEUED', 'SENDING'] } }, data: { status: 'PAUSED' } });
}

/** Sincroniza métricas diárias do provedor de mídia (mock ou real — mesma interface). */
export async function syncCampaignMetrics(orgId: string, campaignId: string, days = 30) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const provider = adsProviderFor(c.source);
  if (!provider) return 0;
  const to = c.endAt && c.endAt < new Date() ? c.endAt : new Date();
  const from = c.startAt && c.startAt > new Date(to.getTime() - days * 86400_000) ? c.startAt : new Date(to.getTime() - days * 86400_000);
  const metrics = await provider.getCampaignMetrics(c.externalId ?? c.id, from, to);
  const dailyBudget = c.budget && c.startAt && c.endAt ? c.budget / Math.max(1, (c.endAt.getTime() - c.startAt.getTime()) / 86400_000) : null;
  for (const m of metrics) {
    const spend = dailyBudget ? Math.min(m.spend, Math.round(dailyBudget * 1.2)) : m.spend;
    await db.campaignMetric.upsert({
      where: { campaignId_date: { campaignId, date: new Date(m.date) } },
      create: { organizationId: orgId, campaignId, date: new Date(m.date), impressions: m.impressions, clicks: m.clicks, spend, providerLeads: m.leads, provider: provider.mode },
      update: { impressions: m.impressions, clicks: m.clicks, spend, providerLeads: m.leads, provider: provider.mode },
    });
  }
  return metrics.length;
}
