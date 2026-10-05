// LeadScoringEngine — motor independente, puro e explicável.
// Não persiste nada: recebe o lead + sinais e devolve score, temperatura e o "porquê".
// As regras e os limites são configuráveis por organização (Organization.settings.scoring).

export interface ScoringInput {
  product?: string | null;
  desiredValue?: number | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  objective?: string | null;
  term?: string | null;
  intent?: string | null;
  optOut?: boolean;
  /** Qualificação declarada na landing da PJ (MORNO/QUENTE): a temperatura nunca fica abaixo dela. */
  landingHeat?: string | null;
  signals?: {
    simulationStarted?: boolean;
    requestedContact?: boolean;
    repliedBot?: boolean;
  } | null;
}

export interface ScoringRule {
  key: string;
  label: string;
  points: number;
  enabled: boolean;
}

export interface ScoringThresholds {
  morno: number; // início da faixa MORNO (padrão 41)
  quente: number; // início da faixa QUENTE (padrão 71)
}

export interface ScoringConfig {
  rules: ScoringRule[];
  thresholds: ScoringThresholds;
}

type Test = (l: ScoringInput) => boolean;

const URGENT_TERM = /imediat|agora|30 dias|1 m[eê]s|at[eé] 3 meses|pr[oó]ximos 3|urgente/i;

// Avaliadores por chave de regra. Novas regras = nova entrada aqui + config.
export const RULE_TESTS: Record<string, Test> = {
  product_informed: (l) => !!l.product,
  value_informed: (l) => Number(l.desiredValue) > 0,
  city_informed: (l) => !!l.city,
  simulation_started: (l) => !!l.signals?.simulationStarted,
  requested_contact: (l) => !!l.signals?.requestedContact,
  replied_bot: (l) => !!l.signals?.repliedBot,
  high_intent: (l) => l.intent === 'HIGH',
  email_informed: (l) => !!l.email,
  objective_informed: (l) => !!l.objective,
  short_term: (l) => !!l.term && URGENT_TERM.test(l.term),
};

export const DEFAULT_SCORING: ScoringConfig = {
  rules: [
    { key: 'product_informed', label: 'Produto informado', points: 10, enabled: true },
    { key: 'value_informed', label: 'Valor informado', points: 10, enabled: true },
    { key: 'city_informed', label: 'Cidade informada', points: 10, enabled: true },
    { key: 'simulation_started', label: 'Simulador iniciado', points: 15, enabled: true },
    { key: 'requested_contact', label: 'Pediu contato', points: 15, enabled: true },
    { key: 'replied_bot', label: 'Respondeu ao bot', points: 12, enabled: true },
    { key: 'high_intent', label: 'Alta intenção detectada', points: 10, enabled: true },
    { key: 'email_informed', label: 'E-mail informado', points: 8, enabled: true },
    { key: 'objective_informed', label: 'Objetivo informado', points: 5, enabled: true },
    { key: 'short_term', label: 'Prazo curto para contratar', points: 5, enabled: true },
  ],
  thresholds: { morno: 41, quente: 71 },
};

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  points: number;
  hit: boolean;
}

export interface ScoreResult {
  score: number;
  temperature: Temperature;
  breakdown: ScoreBreakdownItem[];
}

export type Temperature = 'FRIO' | 'MORNO' | 'QUENTE';
const RANK: Record<Temperature, number> = { FRIO: 0, MORNO: 1, QUENTE: 2 };

/** Frio 0–40 · Morno 41–70 · Quente 71–100 (faixas configuráveis). */
export function classify(score: number, t: ScoringThresholds = DEFAULT_SCORING.thresholds): Temperature {
  if (score >= t.quente) return 'QUENTE';
  if (score >= t.morno) return 'MORNO';
  return 'FRIO';
}

/** Morno ou Quente = lead com interesse: é distribuído para um consultor. Frio fica em nutrição. */
export const isWarmOrHot = (t?: string | null) => t === 'MORNO' || t === 'QUENTE';

export function computeScore(input: ScoringInput, config: ScoringConfig = DEFAULT_SCORING): ScoreResult {
  const breakdown = config.rules
    .filter((r) => r.enabled && RULE_TESTS[r.key])
    .map((r) => ({ key: r.key, label: r.label, points: r.points, hit: !input.optOut && RULE_TESTS[r.key](input) }));
  const score = Math.max(0, Math.min(100, breakdown.reduce((s, r) => s + (r.hit ? r.points : 0), 0)));
  let temperature = classify(score, config.thresholds);
  // Quem pediu na landing para ser chamado agora é Quente, mesmo com poucos dados preenchidos.
  const declared = input.landingHeat === 'QUENTE' || input.landingHeat === 'MORNO' ? input.landingHeat : null;
  if (!input.optOut && declared && RANK[declared] > RANK[temperature]) temperature = declared;
  return { score, temperature, breakdown };
}

/** Intenção operacional derivada de sinais (a IA pode sobrescrever com evidência da conversa). */
export function inferIntent(input: ScoringInput): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (input.signals?.requestedContact && (input.term ? URGENT_TERM.test(input.term) : true)) return 'HIGH';
  if (input.signals?.requestedContact || input.signals?.simulationStarted || input.signals?.repliedBot) return 'MEDIUM';
  return 'LOW';
}

export function mergeScoringConfig(partial?: Partial<ScoringConfig> | null): ScoringConfig {
  if (!partial) return DEFAULT_SCORING;
  const rules = DEFAULT_SCORING.rules.map((r) => ({ ...r, ...(partial.rules?.find((p) => p.key === r.key) ?? {}) }));
  // Configurações antigas (4 faixas: nutricao/qualificado/altaIntencao) caem no padrão de 3 faixas.
  const t = partial.thresholds as Partial<ScoringThresholds> | undefined;
  const thresholds = t && Number(t.morno) > 0 && Number(t.quente) > Number(t.morno) ? { morno: Number(t.morno), quente: Number(t.quente) } : DEFAULT_SCORING.thresholds;
  return { rules, thresholds };
}
