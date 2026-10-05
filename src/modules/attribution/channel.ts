// Classificação do CANAL de origem de uma visita (pura, sem banco — testada em tests/unit).
//
// Google pago x orgânico:
//  • PAGO (GOOGLE_ADS): clique de anúncio (gclid / gbraid / wbraid, que o Google Ads adiciona
//    pelo auto-tagging) ou UTM do Google com meio pago (cpc, ppc, paid, sem…).
//  • ORGÂNICO (GOOGLE_ORGANIC): veio de um domínio de busca do Google (referrer) sem nenhum
//    marcador de anúncio, ou UTM do Google com utm_medium=organic.
// Não há consulta a resultados do Google: só lemos o que o próprio navegador informa na visita.

export type Channel = 'GOOGLE_ADS' | 'GOOGLE_ORGANIC' | 'META' | 'INSTAGRAM' | 'WHATSAPP' | 'LANDING';

export interface VisitSignals {
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'paid-search', 'sem', 'display', 'cpm', 'ads', 'pmax', 'shopping', 'youtube_ads', 'video']);
const GOOGLE_SOURCES = new Set(['google', 'googleads', 'google_ads', 'google-ads', 'adwords']);
const META_SOURCES = new Set(['meta', 'facebook', 'fb']);
const INSTAGRAM_SOURCES = new Set(['instagram', 'ig']);

/** true para google.com, google.com.br, www.google.com.br… (e não para "notgoogle.com" nem "google.meusite.com"). */
export function isGoogleSearchHost(host: string): boolean {
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(host);
}

function referrerHost(referrer?: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyChannel(v: VisitSignals): Channel {
  const src = (v.utm_source ?? '').trim().toLowerCase();
  const medium = (v.utm_medium ?? '').trim().toLowerCase();
  const host = referrerHost(v.referrer);

  // 1) Clique de anúncio do Google (auto-tagging) é pago em qualquer caso.
  if (v.gclid || v.gbraid || v.wbraid) return 'GOOGLE_ADS';

  // 2) UTMs explícitas.
  if (GOOGLE_SOURCES.has(src)) {
    if (medium === 'organic') return 'GOOGLE_ORGANIC';
    // "google" sem meio definido: por convenção, UTM de Google é colocada em anúncios.
    return 'GOOGLE_ADS';
  }
  if (INSTAGRAM_SOURCES.has(src)) return 'INSTAGRAM';
  if (META_SOURCES.has(src) || v.fbclid) return 'META';
  if (src === 'whatsapp' || src === 'wa') return 'WHATSAPP';

  // 3) Sem UTM: pelo site de origem.
  if (host && isGoogleSearchHost(host)) return PAID_MEDIUMS.has(medium) ? 'GOOGLE_ADS' : 'GOOGLE_ORGANIC';
  if (host && /(^|\.)instagram\.com$/.test(host)) return 'INSTAGRAM';
  if (host && /(^|\.)(facebook\.com|fb\.com|l\.facebook\.com)$/.test(host)) return 'META';
  if (host && /(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'WHATSAPP';

  return 'LANDING';
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  GOOGLE_ADS: 'Google Ads (pago)',
  GOOGLE_ORGANIC: 'Google orgânico',
  META: 'Meta Ads',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING: 'Direto / outros',
};
