import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from '@/lib/format';

describe('googleCalendarUrl', () => {
  it('monta o link do Google Agenda em UTC, com 30 min por padrão', () => {
    const u = new URL(googleCalendarUrl({ title: 'Ligar · Ana & Cia', start: '2026-10-06T13:00:00.000Z', details: 'Contato\nLead: https://x/leads/1' }));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Ligar · Ana & Cia');
    expect(u.searchParams.get('dates')).toBe('20261006T130000Z/20261006T133000Z');
    expect(u.searchParams.get('details')).toContain('https://x/leads/1');
  });
});
