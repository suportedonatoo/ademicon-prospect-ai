/**
 * DATAS E HORÁRIOS EM PORTUGUÊS — para marcar reunião pela conversa ("amanhã às 15h", "sexta 10h30",
 * "dia 14 às 3 da tarde", "a segunda opção"). Tudo no fuso informado (padrão America/Sao_Paulo),
 * independente do fuso do servidor.
 */

const WEEKDAYS: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(-feira)?\b/, 1],
  [/\bterca(-feira)?\b/, 2],
  [/\bquarta(-feira)?\b/, 3],
  [/\bquinta(-feira)?\b/, 4],
  [/\bsexta(-feira)?\b/, 5],
  [/\bsabado\b/, 6],
];
const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Data/hora "de parede" no fuso → instante (Date). */
export function zoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const off = offsetMinutes(new Date(guess), tz);
  const first = new Date(guess - off * 60_000);
  // Corrige se o fuso mudar entre o palpite e o resultado (horário de verão).
  const off2 = offsetMinutes(first, tz);
  return off2 === off ? first : new Date(guess - off2 * 60_000);
}

function offsetMinutes(date: Date, tz: string) {
  const p = localParts(date, tz);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000;
}

export function localParts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd };
}

/** "terça-feira, 14/10 às 15h" (ou 15h30). */
export function formatWhen(date: Date, tz: string) {
  const p = localParts(date, tz);
  return `${WEEKDAY_NAMES[p.wd]}, ${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')} às ${p.h}h${p.min ? String(p.min).padStart(2, '0') : ''}`;
}

export interface ParsedWhen {
  /** Dia encontrado (meia-noite local daquele dia) */
  day: { y: number; m: number; d: number } | null;
  /** Hora encontrada */
  time: { h: number; min: number } | null;
  /** Dia + hora resolvidos para um instante */
  at: Date | null;
}

function addDays(base: { y: number; m: number; d: number }, n: number) {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Lê o dia e a hora de uma frase. Não inventa: o que não estiver na frase volta null. */
export function parseWhen(text: string, now: Date, tz: string): ParsedWhen {
  const t = ` ${norm(text)} `;
  const today = localParts(now, tz);
  const todayDate = { y: today.y, m: today.m, d: today.d };

  // ---- hora ----
  let time: { h: number; min: number } | null = null;
  const hm = t.match(/\b([01]?\d|2[0-3])\s*(?:h|:|hs|horas?)\s*([0-5]\d)?\b/) ?? t.match(/\bas\s+([01]?\d|2[0-3])(?:\s*(?:h|:)\s*([0-5]\d))?\b/);
  if (/\bmeio[ -]?dia\b/.test(t)) time = { h: 12, min: /meio[ -]?dia e meia/.test(t) ? 30 : 0 };
  else if (hm) {
    let h = Number(hm[1]);
    const min = hm[2] ? Number(hm[2]) : /\be meia\b/.test(t) ? 30 : 0;
    const tarde = /\b(da tarde|a tarde|de tarde|da noite|a noite|de noite|pm)\b/.test(t);
    const manha = /\b(da manha|de manha|pela manha|am)\b/.test(t);
    if (h < 12 && (tarde || (!manha && h >= 1 && h <= 7))) h += 12; // "às 3" = 15h
    time = { h, min };
  }

  // ---- dia ----
  let day: { y: number; m: number; d: number } | null = null;
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (/\bdepois de amanha\b/.test(t)) day = addDays(todayDate, 2);
  else if (/\bamanha\b/.test(t)) day = addDays(todayDate, 1);
  else if (/\bhoje\b/.test(t)) day = todayDate;
  else if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.y;
    day = { y, m: Number(dm[2]), d: Number(dm[1]) };
    if (!dm[3] && (day.m < today.m || (day.m === today.m && day.d < today.d))) day = { ...day, y: y + 1 };
  } else {
    const wd = WEEKDAYS.find(([re]) => re.test(t));
    const diaN = t.match(/\bdia\s+(\d{1,2})\b/);
    if (wd) {
      let diff = (wd[1] - today.wd + 7) % 7;
      // "segunda" no mesmo dia da semana: hoje só se o horário ainda não passou; senão, a próxima.
      if (diff === 0 && (!time || time.h * 60 + time.min <= today.h * 60 + today.min)) diff = 7;
      day = addDays(todayDate, diff);
    } else if (diaN) {
      // "dia 14": este mês se ainda não passou; senão, o mês que vem.
      const d = Number(diaN[1]);
      day = d >= today.d ? { ...todayDate, d } : { y: today.m === 12 ? today.y + 1 : today.y, m: today.m === 12 ? 1 : today.m + 1, d };
    }
  }

  // Só a hora: hoje se ainda der tempo, senão amanhã.
  let at: Date | null = null;
  if (time) {
    const d = day ?? (time.h * 60 + time.min > today.h * 60 + today.min ? todayDate : addDays(todayDate, 1));
    at = zoned(d.y, d.m, d.d, time.h, time.min, tz);
  }
  return { day, time, at };
}

/** "1", "opção 2", "a primeira", "a última", "o segundo horário" → índice (0-based). null = não é escolha de opção. */
export function parseOption(text: string, count: number): number | null {
  const t = norm(text).trim();
  const solo = t.match(/^(?:a |o |opcao |opc |op |numero |n )?([1-9])[º°ª.!)]*$/);
  if (solo && Number(solo[1]) <= count) return Number(solo[1]) - 1;
  const withWord = t.match(/\b(?:opcao|opc|op|numero|horario)\s*(?:n[º°.]?\s*)?([1-9])\b/);
  if (withWord && Number(withWord[1]) <= count) return Number(withWord[1]) - 1;
  const ord: [RegExp, number][] = [
    [/\b(primeir[ao])\b/, 0],
    [/\b(terceir[ao])\b/, 2],
    [/\b(ultim[ao])\b/, count - 1],
  ];
  for (const [re, i] of ord) if (re.test(t) && i < count) return i;
  // "segunda" sozinha é dia da semana; como opção só com a palavra "opção"/"horário".
  if (/\bsegund[ao]\s+(opcao|opc|horario)\b|\b(opcao|horario)\s+segund[ao]\b/.test(t) && count >= 2) return 1;
  return null;
}

export const WEEKDAY_LABELS = WEEKDAY_NAMES;
