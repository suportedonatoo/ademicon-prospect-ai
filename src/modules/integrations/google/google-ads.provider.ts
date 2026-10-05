import { env } from '@/lib/env';
import type { AdsProvider, AdsCampaignMetric, ExternalLead } from '../types';
import { int, rng } from '../mock-random';

/**
 * GoogleAdsProvider REAL — Google Ads API oficial (REST).
 * Autenticação: OAuth2 (client id/secret + refresh token) + developer token.
 * Métricas: GAQL em customers/{id}/googleAds:search. Leads dos formulários chegam por webhook
 * (/api/v1/webhooks/google-ads/leads), não por consulta.
 */
export class GoogleAdsProvider implements AdsProvider {
  key = 'google_ads';
  name = 'Google Ads';
  category = 'ads' as const;
  mode = 'real' as const;
  private token: { value: string; exp: number } | null = null;

  private get base() {
    return `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}`;
  }
  private customerId = () => digits(env.GOOGLE_ADS_CUSTOMER_ID);

  private async accessToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID!, client_secret: env.GOOGLE_ADS_CLIENT_SECRET!, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!res.ok || !body.access_token) throw new Error(`OAuth do Google recusou: ${body.error_description ?? body.error ?? res.status}`);
    this.token = { value: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async headers() {
    return {
      authorization: `Bearer ${await this.accessToken()}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      'content-type': 'application/json',
      ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) } : {}),
    };
  }

  private async search<T>(query: string): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const res = await fetch(`${this.base}/customers/${this.customerId()}/googleAds:search`, {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await res.json().catch(() => ({}))) as { results?: T[]; nextPageToken?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(`Google Ads API: ${body.error?.message ?? res.status}`);
      out.push(...(body.results ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return out;
  }

  async healthCheck() {
    try {
      const rows = await this.search<{ customer: { descriptiveName?: string; currencyCode?: string } }>('SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
      const c = rows[0]?.customer;
      return { ok: true, mode: this.mode, detail: `Conectado à conta ${c?.descriptiveName ?? this.customerId()}${c?.currencyCode ? ` (${c.currencyCode})` : ''}` };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  /** campaignExternalId = ID da campanha no Google Ads (só números). */
  async getCampaignMetrics(campaignExternalId: string, from: Date, to: Date): Promise<AdsCampaignMetric[]> {
    const id = digits(campaignExternalId);
    if (!id) return [];
    const rows = await this.search<{ segments: { date: string }; metrics: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number } }>(
      `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${ymd(from)}' AND '${ymd(to)}'`
    );
    return rows.map((r) => ({
      date: r.segments.date,
      impressions: Number(r.metrics.impressions ?? 0),
      clicks: Number(r.metrics.clicks ?? 0),
      spend: Math.round(Number(r.metrics.costMicros ?? 0) / 1_000_000),
      leads: Math.round(Number(r.metrics.conversions ?? 0)),
    }));
  }

  /** Lista as campanhas da conta (para vincular às campanhas do sistema). */
  async listCampaigns() {
    const rows = await this.search<{ campaign: { id: string; name: string; status: string } }>("SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name");
    return rows.map((r) => ({ id: r.campaign.id, name: r.campaign.name, status: r.campaign.status }));
  }

  async fetchLeads(): Promise<ExternalLead[]> {
    return []; // formulários chegam por webhook
  }
}

const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Mock com dados determinísticos e claramente identificados como simulados. */
export class MockGoogleAdsProvider implements AdsProvider {
  key = 'google_ads';
  name = 'Google Ads (mock)';
  category = 'ads' as const;
  mode = 'mock' as const;
  constructor(private cpcBase = 2.4) {}
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Dados simulados — configure o Google Ads no painel do Super Admin (Configurar APIs).' };
  }
  async getCampaignMetrics(campaignExternalId: string, from: Date, to: Date): Promise<AdsCampaignMetric[]> {
    return mockDailyMetrics(`gads:${campaignExternalId}`, from, to, this.cpcBase, 0.045);
  }
  async fetchLeads(): Promise<ExternalLead[]> {
    return [];
  }
}

export function mockDailyMetrics(seed: string, from: Date, to: Date, cpc: number, ctr: number): AdsCampaignMetric[] {
  const out: AdsCampaignMetric[] = [];
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (day <= to) {
    const iso = day.toISOString().slice(0, 10);
    const r = rng(`${seed}:${iso}`);
    const impressions = int(r, 800, 4200);
    const clicks = Math.round(impressions * ctr * (0.7 + r() * 0.6));
    out.push({ date: iso, impressions, clicks, spend: Math.round(clicks * cpc * (0.8 + r() * 0.4)), leads: Math.round(clicks * (0.04 + r() * 0.05)) });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

export function createGoogleAdsProvider(): AdsProvider {
  const configured = env.GOOGLE_ADS_CLIENT_ID && env.GOOGLE_ADS_CLIENT_SECRET && env.GOOGLE_ADS_DEVELOPER_TOKEN && env.GOOGLE_ADS_REFRESH_TOKEN && env.GOOGLE_ADS_CUSTOMER_ID;
  return configured ? new GoogleAdsProvider() : new MockGoogleAdsProvider();
}
