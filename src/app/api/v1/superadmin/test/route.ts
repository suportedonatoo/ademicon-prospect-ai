import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { assertSuperAdmin } from '@/modules/platform/credentials.service';
import { providers } from '@/modules/integrations/registry';
import { getAIProvider } from '@/modules/ai/providers';

/** POST /api/v1/superadmin/test { provider } — testa a conexão agora (healthCheck do provider). */
export const POST = authed({ rate: 30 }, async ({ req, ctx }) => {
  assertSuperAdmin(ctx);
  const { provider } = z.object({ provider: z.enum(['whatsapp', 'ai', 'google_ads', 'meta', 'maps', 'instagram']) }).parse(await body(req));
  if (provider === 'maps') {
    const [g, b, c] = await Promise.all([providers.googleMaps.healthCheck(), providers.bingMaps.healthCheck(), providers.companyRegistry.healthCheck()]);
    return { ok: g.ok && c.ok, mode: g.mode, detail: `Google: ${g.detail} · Bing: ${b.detail} · CNPJ: ${c.detail}` };
  }
  if (provider === 'instagram') {
    const { instagramHealth } = await import('@/modules/instagram/instagram.service');
    return instagramHealth();
  }
  const p = { whatsapp: providers.whatsapp, google_ads: providers.googleAds, meta: providers.meta, ai: null }[provider];
  const res = p ? await p.healthCheck() : await getAIProvider().healthCheck();
  return { ...res, mode: res.mode ?? p?.mode };
});
