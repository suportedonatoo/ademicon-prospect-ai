import { logger } from '@/lib/logger';
import { TurnSchema, systemPrompt } from './anthropic.provider';
import { MockAIProvider } from './mock.provider';
import type { AgentTurnInput, AgentTurnOutput, AIProvider, IdeasInput, SummaryInput } from './types';
import { IDEAS_SYSTEM, ideasUserPrompt, parseIdeas, templateIdeas } from './ideas';

// Provider Google Gemini (API REST do AI Studio, sem SDK). Mesmo prompt e mesmo schema do provider Claude.
// Em qualquer falha (rede, cota do plano gratuito, parse), cai para o MockAIProvider — a conversa nunca quebra.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

const nullable = (type: string, extra: object = {}) => ({ type, nullable: true, ...extra });
/** Mesmo formato do TurnSchema, no dialeto de schema aceito pelo Gemini. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    extracted: {
      type: 'OBJECT',
      properties: {
        product: nullable('STRING', { enum: ['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'BENS_MOVEIS'] }),
        objective: nullable('STRING'),
        value: nullable('NUMBER'),
        city: nullable('STRING'),
        uf: nullable('STRING'),
        term: nullable('STRING'),
        objections: { type: 'ARRAY', items: { type: 'STRING' } },
        preferredChannel: nullable('STRING', { enum: ['WHATSAPP', 'PHONE', 'EMAIL'] }),
      },
      required: ['product', 'objective', 'value', 'city', 'uf', 'term', 'objections', 'preferredChannel'],
    },
    intent: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    wantsHuman: { type: 'BOOLEAN' },
    optOut: { type: 'BOOLEAN' },
    isQuestion: { type: 'BOOLEAN' },
    knowledgeGap: { type: 'BOOLEAN' },
    usedKnowledgeIds: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['reply', 'extracted', 'intent', 'wantsHuman', 'optOut', 'isQuestion', 'knowledgeGap', 'usedKnowledgeIds'],
};

type Content = { role: 'user' | 'model'; parts: { text: string }[] };
type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string };
};

export class GeminiAIProvider implements AIProvider {
  name = 'gemini' as const;
  private fallback = new MockAIProvider();

  constructor(private apiKey: string, public model: string) {}

  private async call(path: string, body?: unknown): Promise<{ status: number; json: GeminiResponse & { displayName?: string } }> {
    const res = await fetch(`${BASE}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': this.apiKey, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  /** Confere a chave e o modelo consultando o cadastro do modelo (não gera texto, não gasta cota de geração). */
  async healthCheck() {
    try {
      const { status, json } = await this.call(`models/${this.model}`);
      if (status === 200) return { ok: true, mode: 'real' as const, detail: `Conectado · ${json.displayName ?? this.model}` };
      const why = status === 400 || status === 401 || status === 403 ? 'chave inválida ou sem permissão' : status === 404 ? `modelo "${this.model}" não encontrado` : (json.error?.message ?? `HTTP ${status}`);
      return { ok: false, mode: 'real' as const, detail: `Gemini recusou: ${why}` };
    } catch (e) {
      return { ok: false, mode: 'real' as const, detail: `Gemini inacessível: ${String((e as Error).message ?? e)}` };
    }
  }

  private async generate(model: string, system: string, contents: Content[], json: boolean) {
    const { status, json: r } = await this.call(`models/${model}:generateContent`, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      // Folga no limite: nos modelos que "pensam", o raciocínio também conta como saída.
      generationConfig: { maxOutputTokens: 4000, ...(json ? { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA } : {}) },
    });
    const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (status !== 200 || !text) throw new Error(r.error?.message ?? `HTTP ${status} finishReason=${r.candidates?.[0]?.finishReason ?? '—'}`);
    return { text, usage: r.usageMetadata, modelUsed: r.modelVersion ?? model };
  }

  async generateTurn(i: AgentTurnInput): Promise<AgentTurnOutput> {
    const model = i.model?.startsWith('gemini') ? i.model : this.model;
    const turns: Content[] = i.history.slice(-12).map((h) => ({
      role: h.role === 'lead' ? ('user' as const) : ('model' as const),
      parts: [{ text: h.role === 'human' ? `[consultor humano] ${h.content}` : h.content }],
    }));
    turns.push({ role: 'user', parts: [{ text: i.userMessage ?? '[Início de conversa: envie a primeira mensagem de contato, apresentando-se como assistente automatizado.]' }] });
    // A API espera alternância começando por "user": mescla turnos consecutivos do mesmo papel.
    const contents: Content[] = [];
    for (const t of turns) {
      const last = contents[contents.length - 1];
      if (last && last.role === t.role) last.parts[0].text += `\n${t.parts[0].text}`;
      else contents.push(t);
    }
    if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: '[histórico anterior]' }] });

    try {
      const r = await this.generate(model, systemPrompt(i), contents, true);
      const o = TurnSchema.parse(JSON.parse(r.text));
      return {
        ...o,
        usage: { inputTokens: r.usage?.promptTokenCount ?? 0, outputTokens: r.usage?.candidatesTokenCount ?? 0 },
        modelUsed: r.modelUsed,
        extracted: Object.fromEntries(Object.entries(o.extracted).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))),
      };
    } catch (e) {
      logger.warn('ai.fallback', { model, error: String((e as Error)?.message ?? e).slice(0, 300) });
      return { ...(await this.fallback.generateTurn(i)), modelUsed: 'mock (fallback)', fallback: true };
    }
  }

  async ideas(input: IdeasInput): Promise<string[]> {
    try {
      const r = await this.generate(this.model, IDEAS_SYSTEM, [{ role: 'user', parts: [{ text: ideasUserPrompt(input) }] }], false);
      const list = parseIdeas(r.text, input.message, input.count).filter((x) => !input.exclude?.includes(x));
      return list.length ? list : templateIdeas(input.count, input.exclude);
    } catch (e) {
      logger.warn('ai.ideas_fallback', { error: String((e as Error)?.message ?? e).slice(0, 300) });
      return templateIdeas(input.count, input.exclude);
    }
  }

  async summarize(input: SummaryInput): Promise<string> {
    try {
      const r = await this.generate(
        this.model,
        'Gere um resumo de handoff para o consultor, em português, no formato de linhas "Campo: valor": Interesse, Valor informado, Cidade, Objetivo, Prazo, Intenção, Principal objeção, Origem, Próxima ação sugerida. Use apenas o que está no contexto; escreva "não informado" quando faltar.',
        [{ role: 'user', parts: [{ text: `Fatos: ${JSON.stringify(input.lead)}\n\nConversa:\n${input.history.map((h) => `${h.role}: ${h.content}`).join('\n')}` }] }],
        false
      );
      return r.text;
    } catch (e) {
      logger.warn('ai.summary_fallback', { error: String((e as Error)?.message ?? e).slice(0, 300) });
      return this.fallback.summarize(input);
    }
  }
}
