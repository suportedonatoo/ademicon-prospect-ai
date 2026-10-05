import { describe, expect, it } from 'vitest';
import { supervise } from '@/modules/ai/supervisor/supervisor';
import { detectIntent, extractSlots, isOptOut, wantsHuman } from '@/modules/ai/nlu';
import { simulate } from '@/modules/simulators/simulation-engine';
import { chunkText, cosine, hashEmbed } from '@/modules/knowledge-base/embeddings';

const base = { knowledge: [], lead: {}, userMessage: null, forbiddenTopics: ['política'], isFirstTurn: false, disclosure: 'Sou o assistente virtual.', maxChars: 600 };

describe('AISalesSupervisor', () => {
  it('bloqueia promessa de aprovação/contemplação', () => {
    const v = supervise({ ...base, reply: 'Pode ficar tranquilo, sua contemplação é garantida no mês que vem!' });
    expect(v.action).toBe('BLOCKED');
    expect(v.finalReply).not.toMatch(/garantid/i);
  });

  it('bloqueia taxa/parcela inventada (fora da Knowledge Base)', () => {
    const v = supervise({ ...base, reply: 'A taxa é de 12% e a parcela fica R$ 1.500. Quer seguir?' });
    expect(v.violations.some((x) => x.check === 'knowledge')).toBe(true);
    expect(v.finalReply).not.toMatch(/12%|1\.500/);
    expect(v.finalReply).toMatch(/consultor/);
  });

  it('permite número presente na Knowledge Base ou dito pelo cliente', () => {
    const kb = [{ chunkId: 'k', documentId: 'd', title: 't', content: 'O prazo do grupo é de 180 meses.', score: 0.9 }];
    expect(supervise({ ...base, knowledge: kb, reply: 'Esse grupo tem 180 meses.' }).action).toBe('APPROVED');
    expect(supervise({ ...base, userMessage: 'quero uns R$ 500.000', reply: 'Anotado: R$ 500.000.' }).action).toBe('APPROVED');
  });

  it('não permite fingir ser humano e exige identificação no primeiro contato', () => {
    expect(supervise({ ...base, reply: 'Não sou robô, pode confiar.' }).action).toBe('BLOCKED');
    const first = supervise({ ...base, isFirstTurn: true, reply: 'Olá! Em que posso ajudar?' });
    expect(first.finalReply).toMatch(/assistente virtual/);
  });
});

describe('NLU', () => {
  it('extrai produto, valor, cidade, prazo e objeções', () => {
    const s = extractSlots('Quero comprar uma casa de 500 mil, moro em Jundiaí/SP, preciso nos próximos 3 meses mas tenho medo de demorar para ser contemplado');
    expect(s.product).toBe('IMOVEL');
    expect(s.value).toBe(500000);
    expect(s.city).toBe('Jundiaí');
    expect(s.term).toBe('Até 3 meses');
    expect(s.objections).toContain('Prazo de contemplação');
  });
  it('intenção, pedido de humano e opt-out', () => {
    expect(detectIntent('quero contratar hoje')).toBe('HIGH');
    expect(wantsHuman('quero falar com um consultor')).toBe(true);
    expect(isOptOut('não quero mais receber mensagens')).toBe(true);
  });
});

describe('Simulador (não-fabricação)', () => {
  const cfg = { key: 'IMOVEL', label: 'Imóvel', termOptions: [100], minValue: 1, maxValue: 1e7, adminFeePct: 20, reserveFundPct: 2 };
  it('sem parâmetros verificados usa só crédito ÷ prazo', () => {
    const r = simulate(cfg, 100000, false, 'Aviso.');
    expect(r.options[0]).toMatchObject({ installment: 1000, basis: 'DIVISAO_SIMPLES' });
    expect(r.parametersApplied.adminFeePct).toBeNull();
  });
  it('com parâmetros oficiais verificados aplica taxa e fundo', () => {
    expect(simulate(cfg, 100000, true, 'Aviso.').options[0].installment).toBe(1220);
  });
});

describe('RAG — embeddings e chunking', () => {
  it('textos relacionados são mais próximos que não relacionados', () => {
    const q = hashEmbed('como funciona o lance no consórcio');
    expect(cosine(q, hashEmbed('O lance antecipa a contemplação no consórcio'))).toBeGreaterThan(cosine(q, hashEmbed('horário de funcionamento da loja aos sábados')));
  });
  it('divide por parágrafos respeitando o tamanho', () => {
    const chunks = chunkText(Array.from({ length: 10 }, (_, i) => `Parágrafo ${i} `.repeat(20)).join('\n\n'), 400, 50);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 700)).toBe(true);
  });
});
