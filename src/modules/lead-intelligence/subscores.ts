// LEAD INTELLIGENCE V2 — sub-scores explicáveis + decaimento temporal (motor puro, sem banco).
//
// O "Lead Score" operacional continua sendo o da V1 (scoring-engine.ts): ele define a temperatura
// FRIO/MORNO/QUENTE. Os sub-scores abaixo são DIMENSÕES que explicam o lead e formam o
// "Índice de prioridade" (média ponderada, pesos configuráveis) usado pela Next Best Action e pelo
// Recovery Center. Nada aqui é probabilidade de conversão: é sinal por regra, documentado em
// docs/lead-intelligence.md.

export interface SubScoreInput {
  product?: string | null;
  desiredValue?: number | null;
  city?: string | null;
  objective?: string | null;
  term?: string | null;
  email?: string | null;
  phone?: string | null;
  intent?: string | null;
  optOut?: boolean;
  signals?: { simulationStarted?: boolean; requestedContact?: boolean; repliedBot?: boolean } | null;
  /** Cidade atendida por alguma PJ da organização (fit geográfico). */
  cityServed?: boolean;
  inboundMessages?: number;
  outboundMessages?: number;
  /** Tipos de BuyingSignal registrados (com a maior confiança de cada tipo). */
  buyingSignals?: { type: string; confidence: number }[];
  /** Tipos de IntentEvent recentes (com confiança). */
  intentEvents?: { type: string; confidence: number }[];
  lastInteractionAt?: Date | null;
  lastSignalAt?: Date | null;
  createdAt: Date;
}

export interface SubScoreWeights {
  fit: number;
  intent: number;
  engagement: number;
  behavior: number;
  recency: number;
}

export interface DecayConfig {
  /** Dias sem interação para cada degrau de recência (padrão 7/14/30/60). */
  steps: [number, number, number, number];
  /** A partir de quantos dias o lead vai para nutrição. */
  nurtureDays: number;
  /** A partir de quantos dias o lead vira candidato a reativação. */
  reactivationDays: number;
}

export interface IntelligenceConfig {
  weights: SubScoreWeights;
  decay: DecayConfig;
}

export const DEFAULT_INTELLIGENCE: IntelligenceConfig = {
  weights: { fit: 0.25, intent: 0.3, engagement: 0.15, behavior: 0.15, recency: 0.15 },
  decay: { steps: [7, 14, 30, 60], nurtureDays: 30, reactivationDays: 60 },
};

export interface SubScoreFactor {
  dimension: keyof SubScoreWeights;
  label: string;
  points: number;
}

export interface SubScores {
  fit: number;
  intent: number;
  engagement: number;
  behavior: number;
  recency: number;
  /** Índice de prioridade 0–100 (média ponderada). Não é probabilidade. */
  priorityIndex: number;
  factors: SubScoreFactor[];
  idleDays: number;
  lifecycle: 'ACTIVE' | 'NURTURE' | 'REACTIVATION';
  method: 'RULE';
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86_400_000;

const BEHAVIOR_WEIGHTS: Record<string, number> = {
  simulation_requested: 30,
  requested_contact: 30,
  whatsapp_clicked: 20,
  returned_to_site: 20,
  price_question: 15,
  product_question: 10,
  replied: 10,
  accepted_consultant: 25,
  high_engagement: 15,
};

const INTENT_EVENT_WEIGHTS: Record<string, number> = {
  PURCHASE_INTENT: 35,
  URGENCY: 20,
  SIMULATION_REQUEST: 20,
  CONTACT_REQUEST: 25,
  CALL_REQUEST: 25,
  WHATSAPP_REQUEST: 15,
  FINANCIAL_INTEREST: 15,
  RENEWED_INTEREST: 20,
  RETURN_INTENT: 5,
  COMPARISON: 5,
  DROPOUT: -40,
};

export function recencyScore(idleDays: number, steps: DecayConfig['steps'] = DEFAULT_INTELLIGENCE.decay.steps): number {
  if (idleDays <= 1) return 100;
  if (idleDays <= steps[0]) return 80;
  if (idleDays <= steps[1]) return 60;
  if (idleDays <= steps[2]) return 35;
  if (idleDays <= steps[3]) return 15;
  return 0;
}

export function lifecycleFor(idleDays: number, decay: DecayConfig = DEFAULT_INTELLIGENCE.decay): SubScores['lifecycle'] {
  if (idleDays >= decay.reactivationDays) return 'REACTIVATION';
  if (idleDays >= decay.nurtureDays) return 'NURTURE';
  return 'ACTIVE';
}

export function computeSubScores(input: SubScoreInput, config: IntelligenceConfig = DEFAULT_INTELLIGENCE, now = new Date()): SubScores {
  const factors: SubScoreFactor[] = [];
  const add = (dimension: keyof SubScoreWeights, label: string, points: number) => {
    factors.push({ dimension, label, points });
    return points;
  };
  const s = input.signals ?? {};

  // FIT — o lead tem o perfil que a operação atende?
  let fit = 0;
  if (input.product) fit += add('fit', 'Produto informado', 25);
  if (Number(input.desiredValue) > 0) fit += add('fit', 'Valor de crédito informado', 25);
  if (input.city) fit += add('fit', input.cityServed ? 'Cidade atendida por uma PJ' : 'Cidade informada', input.cityServed ? 25 : 12);
  if (input.objective) fit += add('fit', 'Objetivo informado', 10);
  if (input.term) fit += add('fit', 'Prazo informado', 5);
  if (input.phone && input.email) fit += add('fit', 'Telefone e e-mail', 10);
  else if (input.phone || input.email) fit += add('fit', 'Contato informado', 5);

  // INTENT — quão perto de decidir?
  let intent = 0;
  if (input.intent === 'HIGH') intent += add('intent', 'Alta intenção detectada', 50);
  else if (input.intent === 'MEDIUM') intent += add('intent', 'Intenção média', 25);
  if (s.requestedContact) intent += add('intent', 'Pediu contato', 25);
  if (s.simulationStarted) intent += add('intent', 'Fez simulação', 15);
  const seenIntent = new Set<string>();
  for (const ev of input.intentEvents ?? []) {
    if (seenIntent.has(ev.type)) continue;
    seenIntent.add(ev.type);
    const w = INTENT_EVENT_WEIGHTS[ev.type];
    if (w) intent += add('intent', `Intenção: ${ev.type}`, Math.round(w * ev.confidence));
  }

  // ENGAGEMENT — responde, conversa?
  let engagement = 0;
  const inbound = input.inboundMessages ?? 0;
  if (inbound > 0) engagement += add('engagement', `${inbound} mensagem(ns) do cliente`, Math.min(60, inbound * 12));
  if (s.repliedBot) engagement += add('engagement', 'Respondeu ao assistente', 20);
  const outbound = input.outboundMessages ?? 0;
  if (outbound > 0 && inbound > 0) engagement += add('engagement', 'Conversa com ida e volta', Math.min(20, Math.round((inbound / outbound) * 20)));

  // BEHAVIOR — sinais de compra observados (site, simulador, cliques)
  let behavior = 0;
  const bestByType = new Map<string, number>();
  for (const b of input.buyingSignals ?? []) bestByType.set(b.type, Math.max(bestByType.get(b.type) ?? 0, b.confidence));
  for (const [type, conf] of bestByType) {
    const w = BEHAVIOR_WEIGHTS[type] ?? 5;
    behavior += add('behavior', `Sinal: ${type}`, Math.round(w * conf));
  }

  // RECENCY — decaimento temporal
  const last = [input.lastInteractionAt, input.lastSignalAt, input.createdAt].filter(Boolean).map((d) => (d as Date).getTime());
  const idleDays = Math.max(0, (now.getTime() - Math.max(...last)) / DAY);
  const recency = recencyScore(idleDays, config.decay.steps);
  add('recency', idleDays < 1 ? 'Interação nas últimas 24h' : `Sem interação há ${Math.floor(idleDays)} dia(s)`, recency);

  const out = { fit: clamp(fit), intent: clamp(intent), engagement: clamp(engagement), behavior: clamp(behavior), recency };
  if (input.optOut) return { ...out, intent: 0, engagement: 0, priorityIndex: 0, factors, idleDays, lifecycle: 'NURTURE', method: 'RULE' };
  const w = config.weights;
  const total = w.fit + w.intent + w.engagement + w.behavior + w.recency || 1;
  const priorityIndex = clamp((out.fit * w.fit + out.intent * w.intent + out.engagement * w.engagement + out.behavior * w.behavior + out.recency * w.recency) / total);
  return { ...out, priorityIndex, factors, idleDays, lifecycle: lifecycleFor(idleDays, config.decay), method: 'RULE' };
}

export function mergeIntelligenceConfig(partial?: Partial<IntelligenceConfig> | null): IntelligenceConfig {
  const w = { ...DEFAULT_INTELLIGENCE.weights, ...(partial?.weights ?? {}) };
  for (const k of Object.keys(w) as (keyof SubScoreWeights)[]) if (!(Number(w[k]) >= 0)) w[k] = DEFAULT_INTELLIGENCE.weights[k];
  const d = { ...DEFAULT_INTELLIGENCE.decay, ...(partial?.decay ?? {}) };
  const steps = Array.isArray(d.steps) && d.steps.length === 4 && d.steps.every((x, i, a) => Number(x) > 0 && (i === 0 || x > a[i - 1])) ? d.steps : DEFAULT_INTELLIGENCE.decay.steps;
  const nurture = Number(d.nurtureDays) > 0 ? Number(d.nurtureDays) : DEFAULT_INTELLIGENCE.decay.nurtureDays;
  const reactivation = Number(d.reactivationDays) > nurture ? Number(d.reactivationDays) : Math.max(nurture + 1, DEFAULT_INTELLIGENCE.decay.reactivationDays);
  return { weights: w, decay: { steps: steps as DecayConfig['steps'], nurtureDays: nurture, reactivationDays: reactivation } };
}
