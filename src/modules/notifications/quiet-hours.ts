// Horário de silêncio do USUÁRIO (notificações). Motor puro, com fuso horário explícito.

/** "22:00" → minutos desde 00:00. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h % 24) * 60 + (m || 0);
};

/** Hora/minuto locais no fuso informado. */
export function localMinutes(now: Date, timeZone = 'America/Sao_Paulo'): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function isQuietNow(now: Date, start: string, end: string, timeZone?: string): boolean {
  const cur = localMinutes(now, timeZone);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s > e ? cur >= s || cur < e : cur >= s && cur < e;
}

/** Instante em que o silêncio termina (para liberar as notificações acumuladas). */
export function quietEndsAt(now: Date, start: string, end: string, timeZone?: string): Date | null {
  if (!isQuietNow(now, start, end, timeZone)) return null;
  const cur = localMinutes(now, timeZone);
  const e = toMinutes(end);
  const diff = (e - cur + 24 * 60) % (24 * 60) || 24 * 60;
  const out = new Date(now.getTime() + diff * 60_000);
  out.setSeconds(0, 0);
  return out;
}
