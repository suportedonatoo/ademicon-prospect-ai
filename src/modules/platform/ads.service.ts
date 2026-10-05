import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { providers } from '../integrations/registry';
import { GoogleAdsProvider } from '../integrations/google/google-ads.provider';
import { MetaProvider } from '../integrations/meta/meta.provider';
import { syncCampaignMetrics } from '../campaigns/campaign.service';
import { assertSuperAdmin } from './credentials.service';

/**
 * GOOGLE ADS e META ADS (Super Admin): status da conexão, campanhas da conta, importação para o
 * sistema (vínculo pelo ID externo) e sincronização das métricas diárias.
 */

type Source = 'GOOGLE_ADS' | 'META';

const real = (source: Source) => {
  const p = source === 'GOOGLE_ADS' ? providers.googleAds : providers.meta;
  return p instanceof GoogleAdsProvider || p instanceof MetaProvider ? p : null;
};

export async function adsOverview(ctx: Ctx) {
  assertSuperAdmin(ctx);
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { slug: true } });
  const base = env.APP_URL.replace(/\/$/, '');
  const since = new Date(Date.now() - 30 * 86400_000);
  const out = [];
  for (const source of ['GOOGLE_ADS', 'META'] as Source[]) {
    const provider = source === 'GOOGLE_ADS' ? providers.googleAds : providers.meta;
    const health = await provider.healthCheck().catch((e) => ({ ok: false, mode: provider.mode, detail: String(e) }));
    const [campaigns, leads30, spend] = await Promise.all([
      db.campaign.findMany({ where: { organizationId: ctx.orgId, source }, select: { id: true, name: true, externalId: true, status: true }, orderBy: { createdAt: 'desc' } }),
      db.lead.count({ where: { organizationId: ctx.orgId, source, createdAt: { gte: since }, deletedAt: null } }),
      db.campaignMetric.aggregate({ where: { organizationId: ctx.orgId, campaign: { source }, date: { gte: since } }, _sum: { spend: true, clicks: true, impressions: true } }),
    ]);
    out.push({
      source,
      title: source === 'GOOGLE_ADS' ? 'Google Ads' : 'Meta Ads (Facebook + Instagram)',
      mode: provider.mode,
      health,
      webhookUrl: source === 'GOOGLE_ADS' ? `${base}/api/v1/webhooks/google-ads/leads?org=${org.slug}` : `${base}/api/v1/webhooks/meta/leads?org=${org.slug}`,
      campaigns,
      leads30,
      metrics30: { spend: spend._sum.spend ?? 0, clicks: spend._sum.clicks ?? 0, impressions: spend._sum.impressions ?? 0 },
    });
  }
  return out;
}

/** Campanhas da conta no provedor (só com a integração real). */
export async function remoteCampaigns(ctx: Ctx, source: Source) {
  assertSuperAdmin(ctx);
  const p = real(source);
  if (!p) return { connected: false, campaigns: [] as { id: string; name: string; status: string; linked: boolean }[] };
  const list = await p.listCampaigns();
  const linked = await db.campaign.findMany({ where: { organizationId: ctx.orgId, source, externalId: { in: list.map((c) => c.id) } }, select: { externalId: true } });
  return { connected: true, campaigns: list.map((c) => ({ ...c, linked: linked.some((l) => l.externalId === c.id) })) };
}

/** Cria no sistema as campanhas do provedor que ainda não estão vinculadas. */
export async function importCampaigns(ctx: Ctx, source: Source) {
  const { connected, campaigns } = await remoteCampaigns(ctx, source);
  if (!connected) return { imported: 0 };
  let imported = 0;
  for (const c of campaigns.filter((x) => !x.linked)) {
    await db.campaign.create({ data: { organizationId: ctx.orgId, name: c.name, source, externalId: c.id, status: c.status === 'ENABLED' || c.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' } });
    imported++;
  }
  await audit(ctx, 'campaign.changed', { type: 'Campaign', id: source }, { action: 'imported', count: imported });
  return { imported };
}

/** Puxa as métricas diárias (últimos 30 dias) de todas as campanhas vinculadas. */
export async function syncAllMetrics(ctx: Ctx, source?: Source) {
  assertSuperAdmin(ctx);
  const campaigns = await db.campaign.findMany({ where: { organizationId: ctx.orgId, source: source ? source : { in: ['GOOGLE_ADS', 'META'] }, externalId: { not: null } }, select: { id: true, name: true } });
  const results = [];
  for (const c of campaigns) {
    try {
      results.push({ campaign: c.name, days: await syncCampaignMetrics(ctx.orgId, c.id) });
    } catch (e) {
      results.push({ campaign: c.name, error: (e as Error).message });
    }
  }
  return { campaigns: campaigns.length, results };
}
