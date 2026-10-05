'use client';

import { Icon } from './icon';
import { getSessionKey } from './session';

export interface UnitContact {
  phone: string | null;
  whatsapp: string | null;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** "5511999990000" → "(11) 99999-0000" */
export function formatPhone(n: string) {
  const d = digits(n).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return n;
}

export function trackContactClick(site: string, event: 'WHATSAPP_CLICK' | 'PHONE_CLICK') {
  try {
    const body = JSON.stringify({ site, sessionKey: getSessionKey() ?? undefined, event });
    if (!navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    }
  } catch {
    /* rastreamento nunca bloqueia o contato */
  }
}

export function whatsappHref(whatsapp: string, pjName: string) {
  const text = `Olá! Vim pelo site da ${pjName} e quero saber mais sobre consórcio.`;
  return `https://wa.me/${digits(whatsapp)}?text=${encodeURIComponent(text)}`;
}

/** Botões de contato da UNIDADE (WhatsApp / ligar). Só aparecem se a unidade cadastrou os números. */
export function ContactButtons({ site, pjName, contact, variant = 'light', size = 'md' }: { site: string; pjName: string; contact: UnitContact; variant?: 'light' | 'dark'; size?: 'md' | 'lg' }) {
  if (!contact.whatsapp && !contact.phone) return null;
  const pad = size === 'lg' ? 'px-6 h-12 text-base' : 'px-4 py-2.5 text-sm';
  return (
    <div className="flex flex-wrap gap-2">
      {contact.whatsapp && (
        <a
          href={whatsappHref(contact.whatsapp, pjName)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackContactClick(site, 'WHATSAPP_CLICK')}
          className={`inline-flex items-center gap-2 rounded-xl font-semibold ${variant === 'dark' ? 'border border-white/20 text-white hover:bg-white/10' : 'bg-[#1f9d55] hover:bg-[#188a49] text-white'} ${pad}`}
        >
          <Icon name="whatsapp" className="size-5" /> Falar no WhatsApp
        </a>
      )}
      {contact.phone && (
        <a
          href={`tel:+${digits(contact.phone)}`}
          onClick={() => trackContactClick(site, 'PHONE_CLICK')}
          className={`inline-flex items-center gap-2 rounded-xl font-semibold border ${variant === 'dark' ? 'border-white/30 text-white hover:bg-white/10' : 'border-line text-ink hover:bg-canvas'} ${pad}`}
        >
          <Icon name="phone" className="size-5" /> {formatPhone(contact.phone)}
        </a>
      )}
    </div>
  );
}

/** Botão flutuante de WhatsApp da unidade. */
export function WhatsAppFloat({ site, pjName, whatsapp }: { site: string; pjName: string; whatsapp: string | null }) {
  if (!whatsapp) return null;
  return (
    <a
      href={whatsappHref(whatsapp, pjName)}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackContactClick(site, 'WHATSAPP_CLICK')}
      aria-label={`Falar com a ${pjName} no WhatsApp`}
      className="fixed bottom-5 right-5 z-40 grid place-items-center size-14 rounded-full bg-[#1f9d55] text-white shadow-lg shadow-black/20 hover:scale-105 transition"
    >
      <Icon name="whatsapp" className="size-7" />
    </a>
  );
}
