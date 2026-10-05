import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { createOrg, resetDb } from '../helpers';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import { listCredentials, saveCredentials } from '@/modules/platform/credentials.service';
import { platformDiagnostics } from '@/modules/platform/diagnostics.service';
import { mapGoogleLead, mapMetaLead, receiveGoogleAdsLead, receiveMetaLeads, verifyMetaSignature } from '@/modules/integrations/ads-leads.service';
import { providers } from '@/modules/integrations/registry';
import { GoogleAdsProvider } from '@/modules/integrations/google/google-ads.provider';
import { MetaProvider } from '@/modules/integrations/meta/meta.provider';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let su: Ctx;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Super');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  const user = await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super Teste', roleId: role.id, passwordHash: 'x' } });
  su = await A.ctx(user);
}, 120_000);

afterAll(async () => {
  // Limpa as chaves do painel para não vazar para outros testes.
  await db.platformCredential.deleteMany();
  const { applyCredentials } = await import('@/modules/platform/credentials.service');
  await applyCredentials();
});

describe('Configurar APIs (Super Admin)', () => {
  it('criptografa e nunca devolve o valor', async () => {
    const enc = encryptSecret('segredo-123456');
    expect(enc).not.toContain('segredo');
    expect(decryptSecret(enc)).toBe('segredo-123456');
    expect(decryptSecret(enc.slice(0, -2) + 'xx')).toBeNull(); // adulterado

    await saveCredentials(su, { META_ACCESS_TOKEN: 'EAAtoken-abcd9876', META_AD_ACCOUNT_ID: '1234567890' });
    const row = await db.platformCredential.findUniqueOrThrow({ where: { key: 'META_ACCESS_TOKEN' } });
    expect(row.valueEnc).not.toContain('EAAtoken');
    const meta = (await listCredentials(su)).find((g) => g.id === 'meta')!;
    const token = meta.fields.find((f) => f.key === 'META_ACCESS_TOKEN')!;
    expect(token).toMatchObject({ source: 'painel', display: '••••9876' });
    expect(JSON.stringify(meta)).not.toContain('EAAtoken');
  });

  it('a chave salva passa a valer na hora (provider real da Meta)', async () => {
    expect(env.META_ACCESS_TOKEN).toBe('EAAtoken-abcd9876');
    expect(providers.meta).toBeInstanceOf(MetaProvider);
    await saveCredentials(su, { META_ACCESS_TOKEN: null, META_AD_ACCOUNT_ID: null });
    expect(providers.meta).not.toBeInstanceOf(MetaProvider); // volta ao simulado
  });

  it('só o Super Admin: Admin do cliente não vê nem altera', async () => {
    const admin = await A.ctx(A.users.admin);
    await expect(listCredentials(admin)).rejects.toThrow(/Super Admin/);
    await expect(saveCredentials(admin, { AI_API_KEY: 'x' })).rejects.toThrow(/Super Admin/);
    await expect(platformDiagnostics(admin)).rejects.toThrow(/Super Admin/);
  });

  it('valida opções e campos desconhecidos', async () => {
    await expect(saveCredentials(su, { AI_PROVIDER: 'openai' })).rejects.toThrow(/mock ou anthropic/);
    await expect(saveCredentials(su, { DATABASE_URL: 'x' })).rejects.toThrow(/desconhecido/);
  });
});

describe('Saúde do sistema', () => {
  it('mede infraestrutura e negócio', async () => {
    const d = await platformDiagnostics(su);
    expect(d.system.length).toBeGreaterThan(3);
    expect(d.business.map((b) => b.key)).toEqual(expect.arrayContaining(['leads', 'routing', 'team', 'numbers', 'ads']));
    expect(['OK', 'WARN', 'DOWN']).toContain(d.overall);
  });
});

describe('Google Ads — formulário de lead (webhook)', () => {
  const body = (key: string, id: string) => ({
    lead_id: id,
    google_key: key,
    campaign_id: 987,
    user_column_data: [
      { column_id: 'FULL_NAME', string_value: 'Paula Anúncio' },
      { column_id: 'PHONE_NUMBER', string_value: '+1 305 555 0177' },
      { column_id: 'EMAIL', string_value: 'paula@ex.test' },
    ],
  });

  it('mapeia as colunas do Google', () => {
    expect(mapGoogleLead(body('k', '1'))).toMatchObject({ full_name: 'Paula Anúncio', phone_number: '+1 305 555 0177', email: 'paula@ex.test', campaign: '987' });
  });

  it('chave errada é recusada; certa vira lead na divisão igual; repetido não duplica', async () => {
    await saveCredentials(su, { GOOGLE_ADS_LEAD_FORM_KEY: 'chave-forte-123' });
    await expect(receiveGoogleAdsLead(A.org.slug, body('errada', 'g1'))).rejects.toThrow(/inválida/);
    const r = await receiveGoogleAdsLead(A.org.slug, body('chave-forte-123', 'g1'));
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead).toMatchObject({ source: 'GOOGLE_ADS', routingHint: 'CENTRAL', phone: '13055550177', status: 'ASSIGNED' });
    expect(await receiveGoogleAdsLead(A.org.slug, body('chave-forte-123', 'g1'))).toMatchObject({ duplicate: true });
    expect(await db.lead.count({ where: { name: 'Paula Anúncio' } })).toBe(1);
  });
});

describe('Meta Lead Ads (webhook)', () => {
  it('assinatura do App Secret é obrigatória', async () => {
    await saveCredentials(su, { META_APP_SECRET: 'app-secret-xyz' });
    const raw = JSON.stringify({ object: 'page', entry: [] });
    const sig = `sha256=${crypto.createHmac('sha256', 'app-secret-xyz').update(raw).digest('hex')}`;
    expect(() => verifyMetaSignature(raw, sig)).not.toThrow();
    expect(() => verifyMetaSignature(raw, 'sha256=00')).toThrow(/inválida/);
  });

  it('busca o lead na Graph API e coloca na divisão igual', async () => {
    await saveCredentials(su, { META_ACCESS_TOKEN: 'EAAtoken-0000', META_AD_ACCOUNT_ID: '111' });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '555', created_time: '2026-10-01T10:00:00+0000', campaign_id: '777', field_data: [{ name: 'full_name', values: ['Rui Meta'] }, { name: 'phone_number', values: ['+351 912 345 678'] }] }), { status: 200 })
    );
    const r = await receiveMetaLeads(A.org.slug, { object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '555' } }] }] });
    const url = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(r.results[0].leadId).toBeTruthy();
    expect(url).toContain('/555?');
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.results[0].leadId! } });
    expect(lead).toMatchObject({ source: 'META', routingHint: 'CENTRAL', phone: '351912345678', status: 'ASSIGNED' });
    expect(mapMetaLead({ id: '1', field_data: [{ name: 'first_name', values: ['Ana'] }, { name: 'last_name', values: ['Lima'] }] }).full_name).toBe('Ana Lima');
  });
});

describe('Google Ads API — métricas', () => {
  it('troca o refresh token por access token e converte custo (micros)', async () => {
    await saveCredentials(su, { GOOGLE_ADS_CLIENT_ID: 'cid', GOOGLE_ADS_CLIENT_SECRET: 'csec', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_ADS_REFRESH_TOKEN: 'rt', GOOGLE_ADS_CUSTOMER_ID: '123-456-7890' });
    expect(providers.googleAds).toBeInstanceOf(GoogleAdsProvider);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ segments: { date: '2026-09-30' }, metrics: { impressions: '1000', clicks: '50', costMicros: '125500000', conversions: 4 } }] }), { status: 200 }));
    const m = await providers.googleAds.getCampaignMetrics('42', new Date('2026-09-30'), new Date('2026-09-30'));
    const [, search] = spy.mock.calls;
    spy.mockRestore();
    expect(m).toEqual([{ date: '2026-09-30', impressions: 1000, clicks: 50, spend: 126, leads: 4 }]);
    expect(String(search[0])).toContain('/customers/1234567890/googleAds:search');
    expect((search[1] as RequestInit).headers).toMatchObject({ 'developer-token': 'dev', authorization: 'Bearer at' });
  });
});
