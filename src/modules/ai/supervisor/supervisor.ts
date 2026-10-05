import type { KnowledgeSnippet, LeadFacts } from '../providers/types';

// AISalesSupervisor — revisa TODA resposta antes de chegar ao cliente.
// Agent Response → Policy Check → Knowledge Check → Risk Check → Final Response

export interface SupervisorInput {
  reply: string;
  knowledge: KnowledgeSnippet[];
  lead: LeadFacts;
  userMessage: string | null;
  forbiddenTopics: string[];
  isFirstTurn: boolean;
  disclosure: string;
  maxChars: number;
}

export interface Violation {
  check: 'policy' | 'knowledge' | 'risk' | 'disclosure' | 'length' | 'security';
  rule: string;
  excerpt: string;
}

export interface SupervisorVerdict {
  action: 'APPROVED' | 'REWRITTEN' | 'BLOCKED';
  finalReply: string;
  violations: Violation[];
}

const PROMISES: [RegExp, string][] = [
  [/aprova[cç][aã]o (([eé]|est[aá]|ser[aá]|fica) )?(garantida|certa|assegurada)|garant\w* (a |sua )?aprova|(ser[aá]|vai ser|est[aá]) aprovad[oa] com certeza|100% aprovad|sem an[aá]lise de cr[eé]dito/i, 'Promessa de aprovação'],
  [/contempla[cç][aã]o (([eé]|est[aá]|ser[aá]|fica) )?(garantida|certa|assegurada)|garant\w* (a |sua )?contempla|(ser[aá]|vai ser) contemplad[oa]( com certeza| no| em| j[aá])|contemplad[oa] em \d+/i, 'Garantia de contemplação'],
  [/(sem|zero) risco|lucro garantido|rendimento garantido/i, 'Promessa financeira'],
];

// Delimitadores que entendem acentos (o \b do JavaScript não reconhece "ô", "ã"...).
const PRETENDS_HUMAN = /(?<![\wÀ-ú])(sou (um |uma )?(humano|humana|pessoa real|pessoa de verdade)|n[aã]o sou (um |uma )?(rob[oô]|bot|ia|intelig[eê]ncia artificial|assistente virtual))(?![\wÀ-ú])/i;

// Números sensíveis: dinheiro, percentuais, prazos em meses.
const NUMERIC_CLAIMS = /R\$\s?[\d.,]+(?:\s?(?:mil|milh[oõ]es|mi))?|\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?(?:ao m[eê]s|a\.m\.)|\d+\s?meses/gi;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/\.(?=\d{3})/g, '');

function supported(claim: string, sources: string[]): boolean {
  const c = norm(claim).replace(/^r\$/, '');
  const digits = c.match(/[\d.,]+/)?.[0]?.replace(/[.,]$/, '') ?? c;
  return sources.some((s) => norm(s).includes(digits));
}

function sentences(text: string) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

// ── Segurança (guardrails NO_CONFIDENTIAL_DATA / prompt injection) ──
// Tentativa de sobrescrever instruções, extrair o prompt interno ou mudar o papel da IA.
const PROMPT_INJECTION =
  /(ignor[ae]|esque[cç]a|desconsider[ae]|desobede[cç]a)\s+(todas\s+)?(as\s+|suas\s+|tuas\s+)?(instru[cç][oõ]es|regras|orienta[cç][oõ]es|diretrizes)|(mostr[ae]|revel[ae]|repit[ae]|imprim[ae]|me (passa|manda|diz))\s+(o\s+|seu\s+|teu\s+)?(prompt|system prompt|instru[cç][oõ]es (internas|do sistema)|regras internas|configura[cç][aã]o interna)|prompt\s+(de|do)\s+sistema|system\s*prompt|modo\s+(desenvolvedor|developer|dev)|developer\s+mode|jailbreak|\bDAN\b|(a partir de agora|agora)\s+voc[eê]\s+([eé]|ser[aá]|vai ser)\s+(um|uma)\s+(outr|nov|assistente sem|ia sem)|finja (que|ser)|aja como (se|um|uma)|you are now|ignore (all|previous|prior) instructions/i;
// Pedido de dados de terceiros ou credenciais.
const SENSITIVE_REQUEST =
  /(cpf|rg|telefone|celular|whats(app)?|e-?mail|endere[cç]o|dados)\s+(d[oa]s?\s+)?(outr[oa]s?\s+|[uú]ltimos?\s+|algum\s+|demais\s+)?(clientes?|usu[aá]rios?|leads?)\b|lista\s+(de|com)\s+(clientes|leads|contatos|telefones)|(me\s+(passa|manda|mostra|diz|fala)|qual\s+([eé]\s+)?(a|o))\s+(sua\s+|seu\s+|a\s+|o\s+)?(senha|token|chave\s+de\s+api|api\s*key|credencia(l|is))/i;
// Vazamento de instruções internas ou segredos na resposta gerada.
const REPLY_LEAK = /(instru[cç][oõ]es internas|system prompt|prompt do sistema|voc[eê] [eé] o agente|regras internas:|\bpk_[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9_-]{10,})/i;

const SECURITY_REPLY =
  'Não posso compartilhar instruções internas, credenciais nem dados de outras pessoas. Posso te ajudar com dúvidas sobre consórcio ou chamar um consultor para você.';

/** Guardrails de segurança da mensagem do cliente e da resposta (sem chamar modelo). */
export function securityCheck(userMessage: string | null, reply: string): Violation[] {
  const v: Violation[] = [];
  const msg = userMessage ?? '';
  const inj = msg.match(PROMPT_INJECTION);
  if (inj) v.push({ check: 'security', rule: 'Tentativa de prompt injection / mudança de instruções', excerpt: inj[0] });
  const sens = msg.match(SENSITIVE_REQUEST);
  if (sens) v.push({ check: 'security', rule: 'Pedido de dados de terceiros ou credenciais', excerpt: sens[0] });
  const leak = reply.match(REPLY_LEAK);
  if (leak) v.push({ check: 'security', rule: 'Resposta expunha instrução interna ou segredo', excerpt: leak[0] });
  return v;
}

const SAFE_FALLBACK =
  'Essa informação precisa ser confirmada por um consultor, que vai te passar as condições exatas para o seu caso, sem compromisso.';

export function supervise(input: SupervisorInput): SupervisorVerdict {
  const violations: Violation[] = [];
  let text = input.reply.trim();

  // 0) Security check — injection, dados de terceiros, vazamento. Bloqueia e responde com recusa segura.
  const security = securityCheck(input.userMessage, text);
  if (security.length) return finalize(SECURITY_REPLY, input, security, 'BLOCKED');

  // 1) Policy check — promessas proibidas
  for (const [re, rule] of PROMISES) {
    const m = text.match(re);
    if (m) violations.push({ check: 'policy', rule, excerpt: m[0] });
  }
  // Disclosure — nunca fingir ser humano
  const human = text.match(PRETENDS_HUMAN);
  if (human) violations.push({ check: 'disclosure', rule: 'Afirmou ser humano', excerpt: human[0] });

  // 2) Knowledge check — números precisam estar na Knowledge Base, nos dados do lead ou na fala do cliente
  const sources = [
    ...input.knowledge.map((k) => k.content),
    input.userMessage ?? '',
    input.lead.value ? String(input.lead.value) : '',
  ];
  const unsupportedClaims = (text.match(NUMERIC_CLAIMS) ?? []).filter((c) => !supported(c, sources));
  for (const c of unsupportedClaims) violations.push({ check: 'knowledge', rule: 'Valor/taxa/prazo sem respaldo na Knowledge Base', excerpt: c });

  // 3) Risk check — assuntos proibidos
  for (const topic of input.forbiddenTopics) {
    if (topic.length > 3 && !/garantia/i.test(topic) && text.toLowerCase().includes(topic.toLowerCase())) {
      violations.push({ check: 'risk', rule: `Assunto proibido: ${topic}`, excerpt: topic });
    }
  }

  if (!violations.length) {
    return finalize(text, input, violations, 'APPROVED');
  }

  // Reescrita: remove frases problemáticas; se sobrar pouco, usa resposta segura.
  const bad = violations.map((v) => v.excerpt.toLowerCase());
  const kept = sentences(text).filter((s) => !bad.some((b) => s.toLowerCase().includes(b)));
  const hardBlock = violations.some((v) => v.check === 'policy' || v.check === 'disclosure');
  const question = kept.find((s) => s.trim().endsWith('?'));
  if (hardBlock || kept.join(' ').length < 25) {
    text = [SAFE_FALLBACK, question].filter(Boolean).join(' ');
    return finalize(text, input, violations, 'BLOCKED');
  }
  text = [...kept.filter((s) => s !== question), SAFE_FALLBACK, question].filter(Boolean).join(' ');
  return finalize(text, input, violations, 'REWRITTEN');
}

function finalize(text: string, input: SupervisorInput, violations: Violation[], action: SupervisorVerdict['action']): SupervisorVerdict {
  if (input.isFirstTurn && !/assistente|automatizad|virtual/i.test(text)) {
    text = `${input.disclosure} ${text}`;
    violations.push({ check: 'disclosure', rule: 'Primeiro contato sem identificação de atendimento automatizado (corrigido)', excerpt: '' });
    if (action === 'APPROVED') action = 'REWRITTEN';
  }
  if (text.length > input.maxChars) {
    const cut = sentences(text).reduce((acc, s) => ((acc + ' ' + s).length <= input.maxChars ? `${acc} ${s}`.trim() : acc), '');
    text = cut || text.slice(0, input.maxChars);
    violations.push({ check: 'length', rule: `Resposta acima de ${input.maxChars} caracteres (encurtada)`, excerpt: '' });
    if (action === 'APPROVED') action = 'REWRITTEN';
  }
  return { action, finalReply: text, violations };
}
