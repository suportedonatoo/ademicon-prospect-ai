// Formatação para a interface (seguro para client e server).

export const brl = (v?: number | null, digits = 0) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const brlShort = (v?: number | null) => {
  const n = Number(v || 0);
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (n >= 1e3) return `R$ ${Math.round(n / 1e3)} mil`;
  return brl(n);
};

export const num = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR');
/** Minutos legíveis: 45 min · 2 h 10 min · 1 d 3 h. */
export const minutes = (m?: number | null) => {
  if (m == null) return '—';
  const v = Math.round(m);
  if (v < 60) return `${v} min`;
  if (v < 1440) return `${Math.floor(v / 60)} h${v % 60 ? ` ${v % 60} min` : ''}`;
  return `${Math.floor(v / 1440)} d${Math.floor((v % 1440) / 60) ? ` ${Math.floor((v % 1440) / 60)} h` : ''}`;
};
export const pct = (v?: number | null, digits = 1) => `${Number(v || 0).toFixed(digits).replace('.', ',')}%`;

export const date = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
export const dateTime = (d?: Date | string | null) =>
  d
    ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : '—';

export function timeAgo(d?: Date | string | null) {
  if (!d) return '—';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

export const initials = (name?: string | null) =>
  String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export function minutesToHuman(min?: number | null) {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`;
}

/**
 * Link "Adicionar ao Google Agenda": abre a agenda da própria pessoa com o evento preenchido.
 * Não usa API nem login no sistema — quem confirma e salva é o consultor, na conta Google dele.
 */
export function googleCalendarUrl(e: { title: string; start: Date | string; minutes?: number; details?: string }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20261006T130000Z
  const start = new Date(e.start);
  const end = new Date(start.getTime() + (e.minutes ?? 30) * 60_000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(start)}/${stamp(end)}`, ...(e.details ? { details: e.details } : {}) });
  return `https://calendar.google.com/calendar/render?${q}`;
}
