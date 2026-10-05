import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { masterLandingUrl } from '../consultants/landing-link';

/**
 * ANÚNCIOS PATROCINADOS (Admin Ademicon cadastra):
 * - INDIVIDUAL: 1 consultor pagou → todos os leads do anúncio vão para ele.
 * - GRUPO: vários consultores pagaram → leads divididos igualmente só entre eles.
 * O lead é ligado ao anúncio pelo link próprio (utm_campaign) ou pelo ID da campanha no Google/Meta.
 * Leads orgânicos continuam na divisão igual entre todos.
 */

export const sponsoredAdInput = z.object({
  name: z.string().trim().min(3, 'Dê um nome ao anúncio').max(120),
  source: z.enum(['GOOGLE_ADS', 'META', 'INSTAGRAM', 'OUTRO']),
  consultantIds: z.array(z.string()).min(1, 'Escolha pelo menos 1 consultor que pagou o anúncio').max(200),
  /** ID da campanha no Google Ads / Meta (liga os leads de formulário e as métricas). */
  externalId: z.string().trim().max(60).nullable().optional().or(z.literal('').transform(() => null)),
  budget: z.coerce.number().int().min(0).max(100_000_000).default(0),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
});

const assertAdmin = (ctx: Ctx) => {
  assertCan(ctx, 'campaign.update');
  if (ctx.scope !== 'ORG') throw Forbidden('Somente a gestão (Admin) cadastra anúncios patrocinados.');
};

const centralUrl = () => masterLandingUrl().replace(/\/$/, '');

export function adLink(source: string, code: string) {
  const utmSource = source === 'GOOGLE_ADS' ? 'google' : source === 'META' ? 'facebook' : source === 'INSTAGRAM' ? 'instagram' : 'anuncio';
  return `${centralUrl()}/?utm_source=${utmSource}&utm_medium=cpc&utm_campaign=${code}`;
}

export async function saveSponsoredAd(ctx: Ctx, raw: unknown, id?: string) {
  assertAdmin(ctx);
  const input = sponsoredAdInput.parse(raw);
  const ids = [...new Set(input.consultantIds)];
  const found = await db.consultant.count({ where: { organizationId: ctx.orgId, id: { in: ids }, active: true } });
  if (found !== ids.length) throw BadRequest('Há consultor inválido ou inativo na lista.');
  if (input.endAt && input.startAt && input.endAt < input.startAt) throw BadRequest('A data de fim é antes do início.');
  const data = {
    name: input.name,
    source: input.source,
    sponsorConsultantIds: ids,
    externalId: input.externalId ?? null,
    budget: input.budget,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
  };
  const ad = id
    ? await db.campaign.update({ where: { id, organizationId: ctx.orgId }, data })
    : await db.campaign.create({ data: { organizationId: ctx.orgId, status: 'ACTIVE', utmCampaign: `ad-${crypto.randomBytes(4).toString('hex')}`, ...data } });
  await audit(ctx, 'campaign.changed', { type: 'Campaign', id: ad.id }, { action: id ? 'sponsors_updated' : 'sponsored_created', sponsors: ids.length });
  return { ...ad, link: adLink(ad.source, ad.utmCampaign!) };
}

export async function setSponsoredAdActive(ctx: Ctx, id: string, active: boolean) {
  assertAdmin(ctx);
  const ad = await db.campaign.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!ad) throw NotFound('Anúncio');
  await db.campaign.update({ where: { id }, data: { status: active ? 'ACTIVE' : 'PAUSED' } });
  await audit(ctx, 'campaign.changed', { type: 'Campaign', id }, { action: active ? 'resumed' : 'paused' });
  return { ok: true };
}

/** Anúncios com resultado por patrocinador. Consultor vê só os anúncios que ele pagou. */
export async function listSponsoredAds(ctx: Ctx) {
  const where = {
    organizationId: ctx.orgId,
    NOT: { sponsorConsultantIds: { isEmpty: true } },
    ...(ctx.scope === 'OWN' ? { sponsorConsultantIds: { has: ctx.consultantId ?? '__none__' } } : {}),
  };
  if (ctx.scope !== 'OWN') assertCan(ctx, 'campaign.read');
  const ads = await db.campaign.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (!ads.length) return [];
  const ids = ads.map((a) => a.id);
  const [byConsultant, won, spend, names] = await Promise.all([
    db.lead.groupBy({ by: ['campaignId', 'consultantId'], where: { organizationId: ctx.orgId, campaignId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['campaignId', 'consultantId'], where: { organizationId: ctx.orgId, campaignId: { in: ids }, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
    db.campaignMetric.groupBy({ by: ['campaignId'], where: { organizationId: ctx.orgId, campaignId: { in: ids } }, _sum: { spend: true, clicks: true } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId, id: { in: [...new Set(ads.flatMap((a) => a.sponsorConsultantIds))] } }, select: { id: true, name: true } }),
  ]);
  return ads.map((a) => {
    const sponsors = a.sponsorConsultantIds.map((cid) => {
      const leads = byConsultant.find((r) => r.campaignId === a.id && r.consultantId === cid)?._count._all ?? 0;
      const w = won.find((r) => r.campaignId === a.id && r.consultantId === cid);
      return { id: cid, name: names.find((n) => n.id === cid)?.name ?? '—', leads, sales: w?._count._all ?? 0, soldValue: w?._sum.value ?? 0 };
    });
    const leads = byConsultant.filter((r) => r.campaignId === a.id).reduce((n, r) => n + r._count._all, 0);
    const sales = sponsors.reduce((n, s) => n + s.sales, 0);
    const invested = spend.find((s) => s.campaignId === a.id)?._sum.spend ?? 0;
    // Parte de cada um: investimento real (métricas do Google/Meta) ou, sem métricas, a verba cadastrada — dividido igual.
    const share = (invested || a.budget) / Math.max(1, a.sponsorConsultantIds.length);
    return {
      id: a.id,
      name: a.name,
      source: a.source,
      status: a.status,
      kind: a.sponsorConsultantIds.length === 1 ? ('INDIVIDUAL' as const) : ('GRUPO' as const),
      externalId: a.externalId,
      budget: a.budget,
      startAt: a.startAt,
      endAt: a.endAt,
      link: a.utmCampaign ? adLink(a.source, a.utmCampaign) : null,
      sponsors,
      leads,
      sales,
      cvr: leads ? sales / leads : 0,
      invested,
      cpl: leads && invested ? invested / leads : null,
      sharePerSponsor: share,
      shareFromBudget: !invested && !!a.budget,
    };
  });
}
