import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import type { IntegrationProvider } from './types';
import { createGoogleAdsProvider } from './google/google-ads.provider';
import { createInstagramProvider, createMetaProvider } from './meta/meta.provider';
import { createBingMapsProvider, createGoogleMapsProvider } from './maps/maps.provider';
import { createCompanyRegistryProvider } from './company-registry/company-registry.provider';
import { createWhatsAppProvider } from './whatsapp/whatsapp.provider';
import { AdemiconProvider, ComercialNetAdapter, NewconAdapter } from './ademicon/ademicon.adapters';
import { getAIProvider } from '../ai/providers';
import { getStorageProvider } from '../storage/storage.provider';
import { createEmailProvider } from './email/email.provider';
import { createGoogleCalendarProvider, createMicrosoftCalendarProvider } from './calendar/calendar.provider';
import { webPushProvider } from './push/webpush.provider';

// IntegrationProvider registry — ponto único para descobrir/usar integrações.
export const providers = {
  googleAds: createGoogleAdsProvider(),
  meta: createMetaProvider(),
  instagram: createInstagramProvider(),
  googleMaps: createGoogleMapsProvider(),
  bingMaps: createBingMapsProvider(),
  companyRegistry: createCompanyRegistryProvider(),
  whatsapp: createWhatsAppProvider(),
  ademicon: new AdemiconProvider(),
  newcon: new NewconAdapter(),
  comercialNet: new ComercialNetAdapter(),
  email: createEmailProvider(),
  googleCalendar: createGoogleCalendarProvider(),
  microsoftCalendar: createMicrosoftCalendarProvider(),
  webPush: webPushProvider,
};

/** Recria os providers com as credenciais atuais (chamado quando o Super Admin salva uma chave). */
export function rebuildProviders() {
  providers.googleAds = createGoogleAdsProvider();
  providers.meta = createMetaProvider();
  providers.instagram = createInstagramProvider();
  providers.googleMaps = createGoogleMapsProvider();
  providers.bingMaps = createBingMapsProvider();
  providers.companyRegistry = createCompanyRegistryProvider();
  providers.whatsapp = createWhatsAppProvider();
}

export function allProviders(): IntegrationProvider[] {
  const ai = getAIProvider();
  const storage = getStorageProvider();
  return [
    ...Object.values(providers),
    { key: 'ai', name: `IA (${ai.name})`, category: 'ai', mode: ai.name === 'mock' ? 'mock' : 'real', healthCheck: async () => ai.healthCheck() },
    { key: 'storage', name: `Storage (${storage.name})`, category: 'storage', mode: storage.name === 'local' ? 'mock' : 'real', healthCheck: async () => ({ ok: true, mode: 'real', detail: storage.name }) },
  ] as IntegrationProvider[];
}

export async function integrationStatus(ctx: Ctx) {
  assertCan(ctx, 'integration.read');
  const list = allProviders();
  const results = await Promise.all(
    list.map(async (p) => {
      const health = await p.healthCheck().catch((e) => ({ ok: false, mode: p.mode, detail: String(e) }));
      return { key: p.key, name: p.name, category: p.category, ...health, mode: health.mode ?? p.mode };
    })
  );
  // Espelha o status em Integration (auditoria/observabilidade).
  await Promise.all(
    results.map((r) =>
      db.integration.upsert({
        where: { organizationId_provider: { organizationId: ctx.orgId, provider: r.key } },
        create: {
          organizationId: ctx.orgId,
          provider: r.key,
          name: r.name,
          category: r.category,
          status: r.mode === 'mock' ? 'MOCK' : r.ok ? 'CONNECTED' : 'NOT_CONFIGURED',
          lastHealthAt: new Date(),
          lastError: r.ok ? null : r.detail,
        },
        update: { name: r.name, status: r.mode === 'mock' ? 'MOCK' : r.ok ? 'CONNECTED' : 'NOT_CONFIGURED', lastHealthAt: new Date(), lastError: r.ok ? null : r.detail },
      })
    )
  );
  return results;
}

export type ProviderStatus = 'CONNECTED' | 'MOCK' | 'NOT_CONFIGURED' | 'ERROR' | 'DISABLED';

/** Status atual (sem gravar) — usado pela Saúde da Operação e pela Integration Health. */
export async function providerStatuses(orgId: string) {
  const persisted = await db.integration.findMany({ where: { organizationId: orgId }, select: { provider: true, status: true, lastError: true, lastHealthAt: true } });
  const list = allProviders();
  return Promise.all(
    list.map(async (p) => {
      const t = Date.now();
      const h = await p.healthCheck().catch((e) => ({ ok: false, mode: p.mode, detail: String(e) }));
      const saved = persisted.find((x) => x.provider === p.key);
      const status: ProviderStatus = saved?.status === 'DISABLED' ? 'DISABLED' : h.mode === 'mock' ? 'MOCK' : h.mode === 'placeholder' ? 'NOT_CONFIGURED' : h.ok ? 'CONNECTED' : 'ERROR';
      return { key: p.key, name: p.name, category: p.category, status, detail: h.detail, latencyMs: Date.now() - t, lastError: saved?.lastError ?? null, lastSync: saved?.lastHealthAt ?? null };
    })
  );
}
