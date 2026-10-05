import { HUMAN_REQUEST, detectIntent, extractSlots } from '../ai/nlu';

// DETECÇÃO DE INTENÇÃO E SINAIS DE COMPRA — regras determinísticas (português), com evidência.
// Cada detecção carrega o trecho que a justificou e uma confiança fixa por regra (origin = RULE).
// A IA pode registrar IntentEvents com origin = AI; ambos convivem e ficam auditáveis.

export const INTENT_TYPES = [
  'PURCHASE_INTENT',
  'URGENCY',
  'FINANCIAL_INTEREST',
  'SIMULATION_REQUEST',
  'CONTACT_REQUEST',
  'WHATSAPP_REQUEST',
  'CALL_REQUEST',
  'COMPARISON',
  'OBJECTION',
  'QUESTION',
  'DROPOUT',
  'RETURN_INTENT',
  'RENEWED_INTEREST',
  'SPECIALIST_NEEDED',
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

export const INTENT_LABELS: Record<IntentType, string> = {
  PURCHASE_INTENT: 'Intenção de compra',
  URGENCY: 'Urgência',
  FINANCIAL_INTEREST: 'Interesse financeiro',
  SIMULATION_REQUEST: 'Pediu simulação',
  CONTACT_REQUEST: 'Pediu contato',
  WHATSAPP_REQUEST: 'Pediu WhatsApp',
  CALL_REQUEST: 'Pediu ligação',
  COMPARISON: 'Comparando opções',
  OBJECTION: 'Objeção',
  QUESTION: 'Dúvida',
  DROPOUT: 'Sinal de desistência',
  RETURN_INTENT: 'Vai retornar depois',
  RENEWED_INTEREST: 'Interesse renovado',
  SPECIALIST_NEEDED: 'Precisa de especialista',
};

export const BUYING_SIGNAL_TYPES = [
  'simulation_requested',
  'price_question',
  'product_question',
  'returned_to_site',
  'whatsapp_clicked',
  'replied',
  'requested_contact',
  'accepted_consultant',
  'high_engagement',
] as const;
export type BuyingSignalType = (typeof BUYING_SIGNAL_TYPES)[number];

export const SIGNAL_LABELS: Record<BuyingSignalType, string> = {
  simulation_requested: 'Pediu/fez simulação',
  price_question: 'Perguntou preço/parcela',
  product_question: 'Perguntou sobre produto',
  returned_to_site: 'Voltou ao site',
  whatsapp_clicked: 'Clicou no WhatsApp',
  replied: 'Respondeu',
  requested_contact: 'Pediu contato',
  accepted_consultant: 'Aceitou falar com consultor',
  high_engagement: 'Engajamento alto',
};

export interface DetectedIntent {
  type: IntentType;
  evidence: string;
  confidence: number;
}
export interface DetectedSignal {
  type: BuyingSignalType;
  evidence: string;
  confidence: number;
}

const RULES: { type: IntentType; re: RegExp; confidence: number }[] = [
  { type: 'URGENCY', re: /(urgente|urg[eê]ncia|preciso (logo|agora|r[aá]pido)|o quanto antes|essa semana|esse m[eê]s|imediat)/i, confidence: 0.8 },
  { type: 'FINANCIAL_INTEREST', re: /(renda|sal[aá]rio|entrada|lance|fgts|quanto (fica|sai|custa)|valor da parcela|parcela de|cabe no (meu )?bolso)/i, confidence: 0.7 },
  { type: 'SIMULATION_REQUEST', re: /(simula(r|[cç][aã]o)|faz(er)? uma simula|quero ver (os )?valores|me (passa|manda) (os )?valores)/i, confidence: 0.85 },
  { type: 'CALL_REQUEST', re: /(me liga|pode me ligar|liga(r)? pra mim|prefiro liga[cç][aã]o|me telefona)/i, confidence: 0.9 },
  { type: 'WHATSAPP_REQUEST', re: /(pelo|no|por) (whats|zap|whatsapp)|me chama no (whats|zap)/i, confidence: 0.8 },
  { type: 'COMPARISON', re: /(outra administradora|comparando|financiamento (do|no) banco|vale mais (a pena )?que|melhor que (o )?financiamento|concorr[eê]ncia|outro cons[oó]rcio)/i, confidence: 0.7 },
  { type: 'DROPOUT', re: /(desisti|n[aã]o tenho mais interesse|n[aã]o quero mais|deixa pra l[aá]|n[aã]o vou fazer|perdi o interesse)/i, confidence: 0.85 },
  { type: 'RETURN_INTENT', re: /(volto a falar|te procuro depois|depois eu (retorno|volto)|m[eê]s que vem (eu )?(vejo|falo)|mais pra frente (eu )?(vejo|falo)|me chama (daqui|em) \d+)/i, confidence: 0.75 },
  { type: 'SPECIALIST_NEEDED', re: /(im[oó]vel comercial|para (minha|a) empresa|cnpj|agroneg[oó]cio|trator|frota|pesados|caminh[oõ]es|investidor|v[aá]rias cotas)/i, confidence: 0.7 },
  { type: 'RENEWED_INTEREST', re: /(voltei|lembrei de voc[eê]s|ainda (tem|est[aá]) dispon[ií]vel|quero retomar|agora (eu )?posso|agora sim)/i, confidence: 0.75 },
];

const PRICE_QUESTION = /(quanto (fica|sai|custa|[eé])|valor da parcela|parcela (fica|de quanto)|pre[cç]o|taxa de administra[cç][aã]o|qual a taxa)/i;
const PRODUCT_QUESTION = /(como funciona|o que [eé] (o )?cons[oó]rcio|contempla[cç][aã]o|lance|sorteio|carta de cr[eé]dito|assembleia)/i;

const snippet = (text: string, m: RegExpMatchArray | null) => {
  if (!m || m.index == null) return text.slice(0, 120);
  const start = Math.max(0, m.index - 30);
  return (start > 0 ? '…' : '') + text.slice(start, m.index + m[0].length + 40).trim();
};

/** Intenções presentes em UMA mensagem do cliente. */
export function detectIntents(text: string): DetectedIntent[] {
  const t = text.trim();
  if (!t) return [];
  const out: DetectedIntent[] = [];
  const level = detectIntent(t);
  if (level === 'HIGH') out.push({ type: 'PURCHASE_INTENT', evidence: t.slice(0, 160), confidence: 0.85 });
  for (const r of RULES) {
    const m = t.match(r.re);
    if (m) out.push({ type: r.type, evidence: snippet(t, m), confidence: r.confidence });
  }
  const human = t.match(HUMAN_REQUEST);
  if (human && !out.some((o) => o.type === 'CALL_REQUEST')) out.push({ type: 'CONTACT_REQUEST', evidence: snippet(t, human), confidence: 0.9 });
  const slots = extractSlots(t);
  for (const o of slots.objections ?? []) out.push({ type: 'OBJECTION', evidence: `${o}: ${t.slice(0, 120)}`, confidence: 0.7 });
  if (/\?\s*$/.test(t) || /^(como|o que|qual|quais|quanto|quando|onde|por que|pode|posso|tem)\b/i.test(t)) out.push({ type: 'QUESTION', evidence: t.slice(0, 160), confidence: 0.6 });
  // Dedup por tipo (mantém a maior confiança)
  const best = new Map<IntentType, DetectedIntent>();
  for (const o of out) if (!best.has(o.type) || best.get(o.type)!.confidence < o.confidence) best.set(o.type, o);
  return [...best.values()];
}

/** Sinais de compra derivados de uma mensagem do cliente. */
export function signalsFromMessage(text: string, ctx: { firstReply?: boolean; inboundCount?: number } = {}): DetectedSignal[] {
  const t = text.trim();
  const out: DetectedSignal[] = [];
  if (ctx.firstReply) out.push({ type: 'replied', evidence: t.slice(0, 120), confidence: 1 });
  const price = t.match(PRICE_QUESTION);
  if (price) out.push({ type: 'price_question', evidence: snippet(t, price), confidence: 0.8 });
  const product = t.match(PRODUCT_QUESTION);
  if (product) out.push({ type: 'product_question', evidence: snippet(t, product), confidence: 0.7 });
  const sim = t.match(/(simula(r|[cç][aã]o)|quero ver (os )?valores)/i);
  if (sim) out.push({ type: 'simulation_requested', evidence: snippet(t, sim), confidence: 0.85 });
  const human = t.match(HUMAN_REQUEST);
  if (human) out.push({ type: 'requested_contact', evidence: snippet(t, human), confidence: 0.9 });
  if (/^(sim|pode|pode ser|claro|quero|ok|beleza|combinado)\b/i.test(t) && /consultor|especialista|liga/i.test(t)) out.push({ type: 'accepted_consultant', evidence: t.slice(0, 120), confidence: 0.8 });
  if ((ctx.inboundCount ?? 0) >= 6) out.push({ type: 'high_engagement', evidence: `${ctx.inboundCount} mensagens do cliente`, confidence: 0.7 });
  return out;
}

/** Sinais de compra de eventos de rastreamento (landing / simulador / attribution). */
export function signalFromTracking(eventType: string, meta: { sessionsBefore?: number } = {}): DetectedSignal | null {
  switch (eventType) {
    case 'SIMULATION_STARTED':
    case 'SIMULATION_COMPLETED':
    case 'simulation_start':
    case 'simulation_complete':
      return { type: 'simulation_requested', evidence: 'Simulador usado na landing', confidence: eventType.toLowerCase().includes('complete') ? 1 : 0.7 };
    case 'WHATSAPP_CLICK':
    case 'whatsapp_click':
      return { type: 'whatsapp_clicked', evidence: 'Clique no botão de WhatsApp', confidence: 1 };
    case 'PHONE_CLICK':
      return { type: 'requested_contact', evidence: 'Clique no botão de ligar', confidence: 0.8 };
    case 'PAGE_VIEW':
    case 'landing_view':
      return (meta.sessionsBefore ?? 0) >= 1 ? { type: 'returned_to_site', evidence: `Voltou ao site (${(meta.sessionsBefore ?? 0) + 1}ª visita)`, confidence: Math.min(1, 0.5 + 0.15 * (meta.sessionsBefore ?? 0)) } : null;
    default:
      return null;
  }
}
