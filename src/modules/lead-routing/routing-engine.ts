import { fold } from '@/lib/normalize';

// LeadRoutingEngine — núcleo puro (sem banco), testável isoladamente.
// Fluxo: regra → PJs elegíveis → consultores elegíveis → capacidade → método → consultor.

export type RoutingMethod = 'EQUAL_SPLIT' | 'ROUND_ROBIN' | 'LEAST_LOAD' | 'PRIORITY' | 'SPECIFIC_CONSULTANT';

export interface RuleConditions {
  products?: string[];
  regionIds?: string[];
  cities?: string[];
  ufs?: string[];
  sources?: string[];
  minScore?: number;
}

export interface RoutingRuleLike {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  conditions: RuleConditions;
  pjIds: string[];
  method: RoutingMethod;
  consultantId?: string | null;
  capacity?: number | null;
}

export interface LeadLike {
  product?: string | null;
  city?: string | null;
  uf?: string | null;
  source?: string | null;
  score?: number | null;
  regionId?: string | null;
}

export interface Candidate {
  id: string;
  name: string;
  pjId: string;
  products: string[];
  available: boolean;
  active: boolean;
  maxOpenLeads: number;
  openLeads: number;
  priority: number;
  /** Roteamento avançado (V2): limite de oportunidades abertas e horário de trabalho. */
  maxOpenOpportunities?: number;
  openOpportunities?: number;
  withinWorkingHours?: boolean;
  /** Divisão igual: leads recebidos no período (mês corrente). */
  periodLeads?: number;
}

export interface Step {
  step: string;
  detail: string;
  ok: boolean;
}

export function matchRule(rule: RoutingRuleLike, lead: LeadLike): { matched: boolean; reasons: string[] } {
  const c = rule.conditions || {};
  const reasons: string[] = [];
  const check = (label: string, cond: boolean) => {
    reasons.push(`${label}: ${cond ? 'ok' : 'não atende'}`);
    return cond;
  };
  let ok = true;
  if (c.products?.length) ok = check(`Produto ∈ [${c.products.join(', ')}]`, !!lead.product && c.products.includes(lead.product)) && ok;
  if (c.regionIds?.length) ok = check('Região da regra', !!lead.regionId && c.regionIds.includes(lead.regionId)) && ok;
  if (c.cities?.length) ok = check(`Cidade ∈ [${c.cities.join(', ')}]`, !!lead.city && c.cities.map(fold).includes(fold(lead.city))) && ok;
  if (c.ufs?.length) ok = check(`UF ∈ [${c.ufs.join(', ')}]`, !!lead.uf && c.ufs.includes(lead.uf)) && ok;
  if (c.sources?.length) ok = check(`Origem ∈ [${c.sources.join(', ')}]`, !!lead.source && c.sources.includes(lead.source)) && ok;
  if (c.minScore != null) ok = check(`Score ≥ ${c.minScore}`, (lead.score ?? 0) >= c.minScore) && ok;
  if (!reasons.length) reasons.push('Regra sem condições (aplica a todos)');
  return { matched: ok, reasons };
}

export function filterCandidates(candidates: Candidate[], opts: { product?: string | null; capacity?: number | null; pjIds?: string[] }) {
  const eligible: Candidate[] = [];
  const rejected: { id: string; name: string; reason: string }[] = [];
  for (const c of candidates) {
    const cap = Math.min(c.maxOpenLeads, opts.capacity ?? Infinity);
    let reason = '';
    if (opts.pjIds?.length && !opts.pjIds.includes(c.pjId)) reason = 'PJ fora da regra';
    else if (!c.active) reason = 'inativo';
    else if (!c.available) reason = 'indisponível';
    else if (opts.product && c.products.length && !c.products.includes(opts.product)) reason = 'sem especialização no produto';
    else if (c.openLeads >= cap) reason = `capacidade atingida (${c.openLeads}/${cap})`;
    else if (c.maxOpenOpportunities && (c.openOpportunities ?? 0) >= c.maxOpenOpportunities) reason = `limite de oportunidades (${c.openOpportunities}/${c.maxOpenOpportunities})`;
    if (reason) rejected.push({ id: c.id, name: c.name, reason });
    else eligible.push(c);
  }
  return { eligible, rejected };
}

/**
 * Preferência por quem está no horário de trabalho: se houver elegíveis no expediente, só eles
 * concorrem; se ninguém estiver (ex.: madrugada), todos seguem elegíveis para o lead não ficar parado.
 */
export function preferWorkingHours(eligible: Candidate[]): { eligible: Candidate[]; filtered: number } {
  const inHours = eligible.filter((c) => c.withinWorkingHours !== false);
  if (!inHours.length || inHours.length === eligible.length) return { eligible, filtered: 0 };
  return { eligible: inHours, filtered: eligible.length - inHours.length };
}

/** Escolhe o consultor conforme o método. `pointer` é o contador do round robin. */
export function selectConsultant(eligible: Candidate[], method: RoutingMethod, pointer: number, specificId?: string | null): Candidate | null {
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  switch (method) {
    case 'SPECIFIC_CONSULTANT':
      return sorted.find((c) => c.id === specificId) ?? null;
    case 'LEAST_LOAD':
      return [...sorted].sort((a, b) => a.openLeads / a.maxOpenLeads - b.openLeads / b.maxOpenLeads || a.openLeads - b.openLeads)[0];
    case 'PRIORITY':
      return [...sorted].sort((a, b) => b.priority - a.priority || a.openLeads - b.openLeads)[0];
    case 'EQUAL_SPLIT':
      return pickFewest(sorted, (c) => c.periodLeads ?? 0, pointer);
    case 'ROUND_ROBIN':
    default:
      return sorted[((pointer % sorted.length) + sorted.length) % sorted.length];
  }
}

/**
 * DIVISÃO IGUAL: quem recebeu MENOS no período recebe o próximo. Empate → rodízio (pointer)
 * entre os empatados, em ordem estável. Assim, ao fim do período, todos ficam com a mesma
 * quantidade (diferença máxima de 1), mesmo com ausências — quem ficou indisponível é compensado.
 */
export function pickFewest<T extends { id: string }>(items: T[], count: (i: T) => number, pointer: number): T | null {
  if (!items.length) return null;
  const min = Math.min(...items.map(count));
  const tied = items.filter((i) => count(i) === min).sort((a, b) => a.id.localeCompare(b.id));
  return tied[((pointer % tied.length) + tied.length) % tied.length];
}

/** Início do período da divisão igual: 1º dia do mês corrente no fuso de São Paulo. */
export function equalSplitPeriodStart(now = new Date()): Date {
  const [y, m] = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)); // 00:00 em São Paulo (UTC−3)
}

export interface RoutingRecommendation {
  consultantId: string;
  consultantName: string;
  reason: string;
  confidence: number;
  followed?: boolean;
}

/**
 * AI ROUTING ASSISTANT (§96) — sinal por regra, não modelo treinado: sugere o consultor mais
 * adequado entre os ELEGÍVEIS, pesando especialidade no produto (40%), folga de capacidade (40%)
 * e prioridade configurada (20%). É só recomendação: a decisão final segue a regra da organização.
 */
export function recommendConsultant(eligible: Candidate[], lead: { product?: string | null }): RoutingRecommendation | null {
  if (!eligible.length) return null;
  const scored = eligible
    .map((c) => {
      const specialty = lead.product && c.products.includes(lead.product) ? 1 : c.products.length === 0 ? 0.5 : 0;
      const headroom = c.maxOpenLeads > 0 ? Math.max(0, 1 - c.openLeads / c.maxOpenLeads) : 0;
      const priority = Math.min(1, Math.max(0, c.priority / 10));
      return { c, specialty, headroom, priority, score: 0.4 * specialty + 0.4 * headroom + 0.2 * priority };
    })
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));
  const [best, second] = scored;
  const reasons = [
    best.specialty === 1 ? 'especialista no produto' : best.specialty === 0.5 ? 'atende todos os produtos' : null,
    `capacidade livre ${Math.round(best.headroom * 100)}% (${best.c.openLeads}/${best.c.maxOpenLeads})`,
    best.c.priority ? `prioridade ${best.c.priority}` : null,
  ].filter(Boolean);
  // Confiança = quão destacada é a melhor opção (sem concorrente → alta).
  const gap = second ? best.score - second.score : 1;
  const confidence = Math.round(Math.min(0.95, 0.5 + gap) * 100) / 100;
  return { consultantId: best.c.id, consultantName: best.c.name, reason: reasons.join(' · '), confidence };
}
