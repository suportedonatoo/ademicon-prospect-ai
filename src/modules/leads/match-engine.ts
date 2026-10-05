// DUPLICIDADE AVANÇADA — compara dois leads e devolve nível de confiança + motivos (motor puro).
// A ingestão já funde automaticamente só por IDENTIDADE exata (telefone/e-mail/CNPJ/ID externo).
// Tudo abaixo de MATCH_EXACT vira candidato para revisão humana — nunca é mesclado sozinho.

export type MatchLevel = 'MATCH_EXACT' | 'MATCH_HIGH' | 'MATCH_MEDIUM' | 'MATCH_LOW' | 'NO_MATCH';

export interface MatchLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cnpj: string | null;
  company: string | null;
  city: string | null;
  source: string | null;
}

export interface MatchResult {
  level: MatchLevel;
  score: number;
  reasons: string[];
}

export const MATCH_LABEL: Record<MatchLevel, string> = {
  MATCH_EXACT: 'Exata',
  MATCH_HIGH: 'Alta',
  MATCH_MEDIUM: 'Média',
  MATCH_LOW: 'Baixa',
  NO_MATCH: 'Sem correspondência',
};

const STOP = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(sr|sra|dr|dra|srta)\.?\s+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .join(' ');
}

/** Similaridade de Jaro-Winkler (0–1) — robusta a erros de digitação em nomes curtos. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Similaridade entre nomes completos, TOKEN A TOKEN: cada parte do nome mais curto é comparada com a
 * melhor parte do outro (iniciais valem: "A." ~ "Aparecida"). Assim "Maria Silva" × "Maria Souza"
 * não parece a mesma pessoa só por compartilhar o primeiro nome.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const best = (t: string) => Math.max(...long.map((u) => (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u)) ? 0.95 : jaroWinkler(t, u)));
  const scores = short.map(best);
  const tokenScore = scores.reduce((s, x) => s + x, 0) / scores.length;
  // Primeiro e último nome precisam bater bem; um token fraco derruba a média.
  const weakest = Math.min(...scores);
  return weakest < 0.8 ? Math.min(tokenScore, 0.79) : tokenScore;
}

const phoneTail = (p: string | null) => (p ? p.replace(/\D/g, '').slice(-8) : null);
const emailLocal = (e: string | null) => (e ? e.toLowerCase().split('@')[0].replace(/[._-]/g, '') : null);
const emailDomain = (e: string | null) => (e ? e.toLowerCase().split('@')[1] ?? null : null);
const FREE_DOMAINS = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br']);
const sameCity = (a: string | null, b: string | null) => !!a && !!b && normalizeName(a) === normalizeName(b);

export function compareLeads(a: MatchLead, b: MatchLead): MatchResult {
  const reasons: string[] = [];
  if (a.phone && b.phone && a.phone === b.phone) return { level: 'MATCH_EXACT', score: 100, reasons: ['Mesmo telefone'] };
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) return { level: 'MATCH_EXACT', score: 100, reasons: ['Mesmo e-mail'] };
  if (a.cnpj && b.cnpj && a.cnpj === b.cnpj) return { level: 'MATCH_EXACT', score: 100, reasons: ['Mesmo CNPJ'] };

  let score = 0;
  const nameSim = nameSimilarity(a.name, b.name);
  if (nameSim >= 0.95) {
    score += 40;
    reasons.push('Nome praticamente igual');
  } else if (nameSim >= 0.88) {
    score += 30;
    reasons.push(`Nome muito parecido (${Math.round(nameSim * 100)}%)`);
  } else if (nameSim >= 0.8) {
    score += 15;
    reasons.push(`Nome parecido (${Math.round(nameSim * 100)}%)`);
  }

  const ta = phoneTail(a.phone);
  const tb = phoneTail(b.phone);
  if (ta && tb && ta === tb) {
    score += 45;
    reasons.push('Telefone igual nos 8 últimos dígitos (DDD/9º dígito diferente)');
  }
  const la = emailLocal(a.email);
  const lb = emailLocal(b.email);
  if (la && lb && la === lb && la.length >= 5) {
    score += 30;
    reasons.push('Mesmo usuário de e-mail em domínios diferentes');
  }
  const da = emailDomain(a.email);
  const dbm = emailDomain(b.email);
  if (da && dbm && da === dbm && !FREE_DOMAINS.has(da)) {
    score += 10;
    reasons.push(`Mesmo domínio corporativo (${da})`);
  }
  if (a.company && b.company && normalizeName(a.company) === normalizeName(b.company)) {
    score += 15;
    reasons.push('Mesma empresa');
  }
  if (sameCity(a.city, b.city) && score > 0) {
    score += 10;
    reasons.push('Mesma cidade');
  }
  score = Math.min(99, score); // exato só por identidade
  const level: MatchLevel = score >= 75 ? 'MATCH_HIGH' : score >= 50 ? 'MATCH_MEDIUM' : score >= 30 ? 'MATCH_LOW' : 'NO_MATCH';
  return { level, score, reasons };
}
