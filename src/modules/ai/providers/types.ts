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

export interface SummaryInput {
  lead: LeadFacts;
  history: ChatTurn[];
}

export interface AIProvider {
  name: 'mock' | 'anthropic' | 'gemini';
  model: string;
  generateTurn(input: AgentTurnInput): Promise<AgentTurnOutput>;
  summarize(input: SummaryInput): Promise<string>;
  healthCheck(): Promise<{ ok: boolean; mode: 'mock' | 'real'; detail: string }>;
}
