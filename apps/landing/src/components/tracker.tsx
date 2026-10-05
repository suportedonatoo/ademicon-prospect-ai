'use client';

import { useEffect, useRef } from 'react';
import { getSessionKey, post, setSessionKey } from './session';

/**
 * Registra a visita com o que o próprio navegador informa: UTMs, identificadores de clique de
 * anúncio (gclid/gbraid/wbraid/fbclid) e o site de origem (referrer). O sistema de gestão usa
 * isso para separar Google Ads (pago) de Google orgânico.
 */
export function Tracker({ site }: { site: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const q = new URLSearchParams(window.location.search);
    const pick = (k: string) => q.get(k) || undefined;
    post<{ sessionKey: string }>('/api/track', {
      site,
      sessionKey: getSessionKey() ?? undefined,
      utm_source: pick('utm_source'),
      utm_medium: pick('utm_medium'),
      utm_campaign: pick('utm_campaign'),
      utm_content: pick('utm_content'),
      utm_term: pick('utm_term'),
      c: pick('c'), // link curto de divulgação/indicação do consultor
      gclid: pick('gclid'),
      gbraid: pick('gbraid'),
      wbraid: pick('wbraid'),
      fbclid: pick('fbclid'),
      referrer: document.referrer || undefined,
      event: 'PAGE_VIEW',
    })
      .then((d) => d?.sessionKey && setSessionKey(d.sessionKey))
      .catch(() => {
        /* rastreamento nunca bloqueia a página */
      });
  }, [site]);
  return null;
}
