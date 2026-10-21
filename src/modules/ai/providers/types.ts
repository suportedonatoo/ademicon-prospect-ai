// Contrato do AIProvider. O domínio (Maestro, agentes, supervisor) depende só disto.

export type AgentKey = 'PROSPECT' | 'QUALIFICATION';

export interface KnowledgeSnippet {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  category?: string;
  score: number;
}

export interface LeadFacts {
  name?: string | null;
  product?: string | null;
  objective?: string | null;
  value?: number | null;
  city?: string | null;
  uf?: string | null;
  term?: string | null;
  objections?: string[];
  score?: number;
  temperature?: string;
  source?: string | null;
  intent?: string | null;
  summary?: string | null;
}

export interface ChatTurn {
  role: 'lead' | 'assistant' | 'human';
  content: string;
}

export interface AgentTurnInput {
  agentKey: AgentKey;
  instructions: string;
  playbook?: { key: string; name: string; objective: string; rules: string[]; nextAction: string } | null;
  personality: { formality: string; objectivity: string; emojis: boolean; style: string };
  disclosure: string;
  forbiddenTopics: string[];
  isFirstTurn: boolean;
  lead: LeadFacts;
  missingSlots: string[]; // slots que ainda faltam (nunca perguntar o que já se sabe)
  history: ChatTurn[];
  userMessage: string | null; // null = mensagem proativa (primeiro contato)
  knowledge: KnowledgeSnippet[];
  minRelevance: number;
  model?: string | null;
  temperature?: number | null;
}

export interface ExtractedSlots {
  product?: string | null;
  objective?: string | null;
  value?: number | null;
  city?: string | null;
  uf?: string | null;
  term?: string | null;
  objections?: string[];
  preferredChannel?: string | null;
}

export interface AgentTurnOutput {
  reply: string;
  extracted: ExtractedSlots;
  intent: 'LOW' | 'MEDIUM' | 'HIGH';
  wantsHuman: boolean;
  optOut: boolean;
  isQuestion: boolean;
  knowledgeGap: boolean;
  usedKnowledgeIds: string[];
  /** Tokens informados pelo provider (ausente no mock). */
  usage?: { inputTokens: number; outputTokens: number };
  /** Modelo que efetivamente respondeu. */
  modelUsed?: string;
  /** true quando o provider principal falhou e o fallback respondeu. */
  fallback?: boolean;
}

/** Ideias de mensagem (ex.: Direct do Instagram) a partir do texto escrito pelo consultor. */
export interface IdeasInput {
  /** Mensagem do consultor */
  message: string;
  /** Contexto: post, palavras-chave, nome do consultor */
  context: string;
  count: number;
  /** Ideias já mostradas ("gerar outras"): não repetir */
  exclude?: string[];
}

/** Agente Pesquisador: roteiro de ligação e 1ª mensagem para o decisor de uma empresa analisada. */
export interface PitchInput {
  company: string;
  segment: string;
  activity: string;
  product: string;
  city: string;
  decisionMaker: { name: string; role?: string } | null;
  reasons: string[];
}

export interface PitchOutput {
  approach: string;
  message: string;
}

export interface SummaryInput {
  lead: LeadFacts;
  history: ChatTurn[];
}

export interface AIProvider {
  name: 'mock' | 'anthropic' | 'gemini';
  model: string;
  generateTurn(input: AgentTurnInput): Promise<AgentTurnOutput>;
  summarize(input: SummaryInput): Promise<string>;
  ideas(input: IdeasInput): Promise<string[]>;
  /** null = sem IA ou resposta inválida (o agente usa o texto padrão). */
  pitch(input: PitchInput): Promise<PitchOutput | null>;
  healthCheck(): Promise<{ ok: boolean; mode: 'mock' | 'real'; detail: string }>;
}
