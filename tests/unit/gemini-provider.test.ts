import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAIProvider } from '@/modules/ai/providers/gemini.provider';
import type { AgentTurnInput } from '@/modules/ai/providers/types';

const input: AgentTurnInput = {
  agentKey: 'PROSPECT',
  instructions: 'Você é o assistente.',
  personality: { formality: 'média', objectivity: 'alta', emojis: false, style: 'Direto.' },
  disclosure: 'Sou um assistente virtual.',
  forbiddenTopics: [],
  isFirstTurn: false,
  lead: { name: 'Ana' },
  missingSlots: ['city'],
  history: [{ role: 'assistant', content: 'Olá!' }, { role: 'lead', content: 'Oi' }],
  userMessage: 'Quero um imóvel em Jundiaí',
  knowledge: [],
  minRelevance: 0.5,
};
const turn = { reply: 'Perfeito, Ana!', extracted: { product: 'IMOVEL', objective: null, value: null, city: 'Jundiaí', uf: null, term: null, objections: [], preferredChannel: null }, intent: 'MEDIUM', wantsHuman: false, optOut: false, isQuestion: false, knowledgeGap: false, usedKnowledgeIds: [] };
const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('GeminiAIProvider', () => {
  it('envia chave no cabeçalho, alterna papéis a partir de "user" e devolve a saída validada', async () => {
    const f = reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(turn) }] } }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 }, modelVersion: 'gemini-2.5-flash' });
    vi.stubGlobal('fetch', f);
    const out = await new GeminiAIProvider('k-123', 'gemini-2.5-flash').generateTurn(input);

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(url).not.toContain('k-123'); // a chave nunca vai na URL
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-123');
    const body = JSON.parse(init.body as string);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.contents[2].parts[0].text).toBe('Oi\nQuero um imóvel em Jundiaí');

    expect(out.reply).toBe('Perfeito, Ana!');
    expect(out.extracted).toEqual({ product: 'IMOVEL', city: 'Jundiaí' }); // nulos e listas vazias saem
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(out.fallback).toBeUndefined();
  });

  it('cota estourada ou resposta inválida → responde pelo roteiro (fallback), sem quebrar', async () => {
    vi.stubGlobal('fetch', reply(429, { error: { message: 'quota' } }));
    const out = await new GeminiAIProvider('k', 'gemini-2.5-flash').generateTurn(input);
    expect(out.fallback).toBe(true);
    expect(out.reply.length).toBeGreaterThan(0);
  });

  it('healthCheck gera de verdade: acusa modelo descontinuado e chave inválida', async () => {
    vi.stubGlobal('fetch', reply(404, { error: { message: 'This model is no longer available to new users.' } }));
    const gone = await new GeminiAIProvider('k', 'gemini-x').healthCheck();
    expect(gone.ok).toBe(false);
    expect(gone.detail).toMatch(/no longer available/);
    vi.stubGlobal('fetch', reply(403, {}));
    expect((await new GeminiAIProvider('k', 'gemini-3.5-flash-lite').healthCheck()).detail).toMatch(/chave inválida/);
    vi.stubGlobal('fetch', reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }], modelVersion: 'gemini-3.5-flash-lite' }));
    expect((await new GeminiAIProvider('k', 'gemini-3.5-flash-lite').healthCheck()).ok).toBe(true);
  });
});
