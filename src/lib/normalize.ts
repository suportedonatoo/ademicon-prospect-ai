// Normalização de dados de contato — base da deduplicação.

/** Telefone → somente dígitos com DDI (BR sem DDI vira 55…; com + ou 00 mantém o DDI informado). */
export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  // Número internacional explícito (+DDI ou 00DDI): mantém como digitado — atendemos brasileiros no exterior.
  if (raw.startsWith('+') || raw.startsWith('00')) {
    d = d.replace(/^00/, '');
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  d = d.replace(/^0+/, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 10 ? d : null;
}

export function formatPhone(normalized?: string | null): string {
  if (!normalized) return '—';
  if (!normalized.startsWith('55')) return `+${normalized}`; // número de fora do Brasil
  const d = normalized.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return normalized;
}

export function normalizeEmail(input?: string | null): string | null {
  if (!input) return null;
  const e = String(input).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function normalizeCnpj(input?: string | null): string | null {
  if (!input) return null;
  const d = String(input).replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

export function isValidCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((s, n, i) => s + n * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatCnpj(d?: string | null): string {
  if (!d || d.length !== 14) return d || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function normalizeName(input?: string | null): string {
  const s = String(input || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const lower = ['da', 'de', 'do', 'das', 'dos', 'e'];
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && lower.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function normalizeUf(input?: string | null): string | null {
  const s = String(input || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** "Jundiaí/SP" ou "Jundiaí - SP" → { city, uf } */
export function splitCityUf(input?: string | null): { city: string | null; uf: string | null } {
  if (!input) return { city: null, uf: null };
  const m = String(input).match(/^(.*?)[\s]*[/\-,][\s]*([A-Za-z]{2})$/);
  if (m) return { city: normalizeName(m[1]), uf: m[2].toUpperCase() };
  return { city: normalizeName(input), uf: null };
}

/** Remove acentos e baixa caixa — para comparações de cidade/região. */
export const fold = (s?: string | null) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function parseMoney(input: unknown): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Math.round(input);
  const s = String(input).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // "500.000,00" → 500000 ; "500000" → 500000 ; "500,000.00" → 500000
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const TITLES = /^(dr|dra|sr|sra|srta|prof|profa|eng|me|mestre|dom|dona)\.?$/i;

/** Primeiro nome para tratamento ("Dr. João Silva" → "João"). Ignora títulos e pronomes de tratamento. */
export function firstName(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.find((p) => !TITLES.test(p)) ?? parts[0] ?? '';
}
