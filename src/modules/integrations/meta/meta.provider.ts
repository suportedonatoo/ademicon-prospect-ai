import { env } from '@/lib/env';
import type { AdsProvider, AdsCampaignMetric, ExternalLead } from '../types';
import { mockDailyMetrics } from '../google/google-ads.provider';

/**
 * MetaProvider REAL — Marketing API (Graph API).
 * Métricas: /{campaign_id}/insights (diário). Leads (Lead Ads) chegam por webhook "leadgen"
 * (/api/v1/webhooks/meta/leads) e são buscados em /{leadgen_id}.
 */
export class MetaProvider implements AdsProvider {
  key = 'meta';
  name = 'Meta Ads';
  category = 'ads' as const;
  mode = 'real' as const;

  protected get base() {
    return `https://graph.facebook.com/${env.META_API_VERSION}`;
  }

  protected async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { authorization: `Bearer ${env.META_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(`Meta Graph API: ${body.error?.message ?? res.status}`);
    return body;
  }

  async healthCheck() {
    try {
      const acc = await this.get<{ name?: string; currency?: string; account_status?: number }>(`act_${digits(env.META_AD_ACCOUNT_ID)}`, { fields: 'name,currency,account_status' });
      return { ok: acc.account_status === 1 || acc.account_status == null, mode: this.mode, detail: `Conta ${acc.name ?? env.META_AD_ACCOUNT_ID}${acc.currency ? ` (${acc.currency})` : ''}${acc.account_status && acc.account_status !== 1 ? ` · status ${acc.account_status}` : ''}` };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  /** campaignExternalId = ID da campanha na Meta. */
  async getCampaignMetrics(campaignExternalId: string, from: Date, to: Date): Promise<AdsCampaignMetric[]> {
    const id = digits(campaignExternalId);
    if (!id) return [];
    const out: AdsCampaignMetric[] = [];
    let after: string | undefined;
    do {
      const page = await this.get<{ data: { date_start: string; impressions?: string; clicks?: string; spend?: string; actions?: { action_type: string; value: string }[] }[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${id}/insights`, {
        fields: 'impressions,clicks,spend,actions',
        time_increment: '1',
        time_range: JSON.stringify({ since: ymd(from), until: ymd(to) }),
        limit: '100',
        ...(after ? { after } : {}),
      });
      for (const r of page.data) {
        const leads = r.actions?.filter((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped').reduce((n, a) => Math.max(n, Number(a.value)), 0) ?? 0;
        out.push({ date: r.date_start, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), spend: Math.round(Number(r.spend ?? 0)), leads });
      }
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
    } while (after);
    return out;
  }

  async listCampaigns() {
    const page = await this.get<{ data: { id: string; name: string; status: string }[] }>(`act_${digits(env.META_AD_ACCOUNT_ID)}/campaigns`, { fields: 'id,name,status', limit: '200' });
    return page.data;
  }

  /** Lead Ads: dados do formulário preenchido (recebido pelo webhook leadgen). */
  async getLead(leadgenId: string) {
    return this.get<{ id: string; created_time: string; field_data: { name: string; values: string[] }[]; campaign_id?: string; ad_id?: string; form_id?: string }>(digits(leadgenId), {
      fields: 'id,created_time,field_data,campaign_id,ad_id,form_id',
    });
  }

  async fetchLeads(): Promise<ExternalLead[]> {
    return []; // Lead Ads chegam por webhook
  }
}

const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export class MockMetaProvider implements AdsProvider {
  key = 'meta';
  name = 'Meta Ads (mock)';
  category = 'ads' as const;
  mode = 'mock' as const;
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Dados simulados — configure a Meta no painel do Super Admin (Configurar APIs).' };
  }
  async getCampaignMetrics(id: string, from: Date, to: Date) {
    return mockDailyMetrics(`meta:${id}`, from, to, 1.6, 0.012);
  }
  async fetchLeads(): Promise<ExternalLead[]> {
    return [];
  }
}

/** Instagram usa a mesma infraestrutura da Meta; separado para métricas por canal. */
export class MockInstagramProvider extends MockMetaProvider {
  key = 'instagram';
  name = 'Instagram (mock)';
  async getCampaignMetrics(id: string, from: Date, to: Date) {
    return mockDailyMetrics(`ig:${id}`, from, to, 1.3, 0.015);
  }
}

export class InstagramProvider extends MetaProvider {
  key = 'instagram';
  name = 'Instagram';
}

const metaConfigured = () => !!(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
export function createMetaProvider(): AdsProvider {
  return metaConfigured() ? new MetaProvider() : new MockMetaProvider();
}
export function createInstagramProvider(): AdsProvider {
  return metaConfigured() ? new InstagramProvider() : new MockInstagramProvider();
}
