import { describe, expect, it } from 'vitest';
import { MockAIProvider, isCustomerFacing } from '@/modules/ai/providers/mock.provider';
import { titleBonus } from '@/modules/knowledge-base/knowledge.service';
import type { AgentTurnInput } from '@/modules/ai/providers/types';

const base = (over: Partial<AgentTurnInput> = {}): AgentTurnInput =>
  ({
    agentKey: 'PROSPECT',
    instructions: '',
    playbook: null,
    personality: { formality: 'neutro', objectivity: 'equilibrado', emojis: false, style: '' },
    disclosure: 'Sou o assistente virtual.',
    forbiddenTopics: [],
    isFirstTurn: false,
    lead: {},
    missingSlots: [],
    history: [],
    userMessage: '',
    knowledge: [],
    minRelevance: 0.18,
    ...over,
  }) as AgentTurnInput;

describe('Roteiro gratuito (sem IA paga)', () => {
  const bot = new MockAIProvider();

  it('responde cumprimento com cumprimento, sem fingir que já tem dados', async () => {
    for (const msg of ['Oi', 'olá!', 'Bom dia', 'boa noite, tudo bem?']) {
      const r = await bot.generateTurn(base({ userMessage: msg }));
      expect(r.reply).toContain('O que você gostaria de saber?');
      expect(r.reply).not.toContain('Com essas informações');
    }
  });

  it('sem produto nem valor, pergunta o bem em vez de oferecer simulação "com essas informações"', async () => {
    const r = await bot.generateTurn(base({ userMessage: 'Tem juros?' }));
    expect(r.reply).toContain('Qual bem você tem em mente');
    const r2 = await bot.generateTurn(base({ userMessage: 'quero um carro de 80 mil' }));
    expect(r2.reply).toContain('Com essas informações');
  });

  it('nunca mostra ao cliente instrução interna nem aviso de demonstração', async () => {
    expect(isCustomerFacing('Explique sorteio e lance com o material oficial.')).toBe(false);
    expect(isCustomerFacing('Respeite o tempo do cliente.')).toBe(false);
    expect(isCustomerFacing('Conteúdo genérico de demonstração — substituir por material oficial aprovado.')).toBe(false);
    expect(isCustomerFacing('O consórcio não tem juros, e sim taxa de administração.')).toBe(true);
    const r = await bot.generateTurn(
      base({
        userMessage: 'Vou pensar',
        knowledge: [
          { chunkId: 'a', documentId: 'd', title: 'Objeção: vou pensar', category: 'OBJECOES', score: 0.9, content: 'Respeite o tempo do cliente. Ofereça enviar um resumo.\n\nConteúdo genérico de demonstração — substituir por material oficial aprovado.' },
          { chunkId: 'b', documentId: 'e', title: 'Objeção: vou pensar', category: 'OBJECOES', score: 0.8, content: 'Pensar com calma faz parte. Um consultor pode enviar o resumo da simulação pelo WhatsApp.' },
        ],
      })
    );
    expect(r.reply).toContain('Pensar com calma faz parte');
    expect(r.reply).not.toMatch(/Respeite|Ofereça|demonstração/);
  });
});

describe('Busca na Knowledge Base: bônus pelo título', () => {
  it('pergunta curta casa com o título da pergunta do FAQ', () => {
    expect(titleBonus('É golpe?', 'Objeção: é golpe?')).toBeCloseTo(0.3);
    expect(titleBonus('Como funciona a contemplação no consórcio?', 'Contemplação: sorteio e lance')).toBeCloseTo(0.3);
    expect(titleBonus('Como funciona a contemplação no consórcio?', 'O que é consórcio')).toBe(0);
  });

  it('palavra rara entre os títulos vale mais que palavra comum', () => {
    const titles = ['FAQ: o que acontece se atrasar?', 'Objeção: parcela alta', 'Parcela e reajuste', 'Objeção: parcela alta'];
    expect(titleBonus('E se eu atrasar a parcela?', titles[0], titles)).toBeGreaterThan(titleBonus('E se eu atrasar a parcela?', titles[1], titles));
  });
});
