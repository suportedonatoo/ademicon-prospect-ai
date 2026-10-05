'use client';

import { useEffect } from 'react';
import { SESSION_KEY } from './simulator-widget';

/** Tracking de landing: envia PAGE_VIEW com UTMs/gclid/fbclid e guarda a AttributionSession. */
export function LandingTracker({ slug, disabled }: { slug: string; disabled?: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const p = new URLSearchParams(window.location.search);
    let sessionKey: string | null = null;
    try {
      sessionKey = localStorage.getItem(SESSION_KEY);
    } catch {
      /* navegação privada */
    }
    fetch('/api/v1/public/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        sessionKey,
        utm_source: p.get('utm_source'),
        utm_medium: p.get('utm_medium'),
        utm_campaign: p.get('utm_campaign'),
        utm_content: p.get('utm_content'),
        utm_term: p.get('utm_term'),
        gclid: p.get('gclid'),
        fbclid: p.get('fbclid'),
        referrer: document.referrer || null,
      }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.data?.sessionKey) {
          try {
            localStorage.setItem(SESSION_KEY, j.data.sessionKey);
          } catch {
            /* ignora */
          }
        }
      })
      .catch(() => undefined);
  }, [slug, disabled]);
  return null;
}
