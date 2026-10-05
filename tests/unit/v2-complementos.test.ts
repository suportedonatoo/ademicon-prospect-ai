import { describe, expect, it } from 'vitest';
import { creditFor, dedupeTouches, type Touch } from '@/modules/attribution/models';
import { recommendConsultant, type Candidate } from '@/modules/lead-routing/routing-engine';

const d = (day: number) => new Date(Date.UTC(2026, 8, day));
const journey: Touch[] = [
  { channel: 'GOOGLE_ORGANIC', at: d(1) },
  { channel: 'META', at: d(10) },
  { channel: 'GOOGLE_ADS', at: d(20) },
];
const round = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => [k, Math.round(v * 1000) / 1000]));

describe('Atribuição multi-toque (5 modelos)', () => {
  it('primeiro e último toque dão 100% a um canal', () => {
    expect(round(creditFor(journey, 'FIRST_TOUCH', d(21)))).toEqual({ GOOGLE_ORGANIC: 1 });
    expect(round(creditFor(journey, 'LAST_TOUCH', d(21)))).toEqual({ GOOGLE_ADS: 1 });
  });
  it('linear divide igualmente', () => {
    expect(round(creditFor(journey, 'LINEAR', d(21)))).toEqual({ GOOGLE_ORGANIC: 0.333, META: 0.333, GOOGLE_ADS: 0.333 });
  });
  it('posição 40/20/40 (e casos de 1 e 2 toques)', () => {
    expect(round(creditFor(journey, 'POSITION_BASED', d(21)))).toEqual({ GOOGLE_ORGANIC: 0.4, META: 0.2, GOOGLE_ADS: 0.4 });
    expect(round(creditFor(journey.slice(0, 1), 'POSITION_BASED', d(21)))).toEqual({ GOOGLE_ORGANIC: 1 });
    expect(round(creditFor(journey.slice(0, 2), 'POSITION_BASED', d(21)))).toEqual({ GOOGLE_ORGANIC: 0.5, META: 0.5 });
  });
  it('decaimento no tempo favorece toques próximos da conversão e soma 100%', () => {
    const c = creditFor(journey, 'TIME_DECAY', d(21));
    expect(c.get('GOOGLE_ADS')!).toBeGreaterThan(c.get('META')!);
    expect(c.get('META')!).toBeGreaterThan(c.get('GOOGLE_ORGANIC')!);
    expect([...c.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('mesmo canal repetido acumula crédito; toques duplicados no mesmo minuto contam uma vez', () => {
    const t = [...journey, { channel: 'GOOGLE_ADS', at: d(20) }];
    expect(dedupeTouches(t)).toHaveLength(3);
    expect(round(creditFor([journey[0], journey[2], { channel: 'GOOGLE_ADS', at: d(15) }], 'LINEAR', d(21)))).toEqual({ GOOGLE_ORGANIC: 0.333, GOOGLE_ADS: 0.667 });
  });
});

describe('AI Routing Assistant (sinal por regra)', () => {
  const c = (id: string, over: Partial<Candidate>): Candidate => ({ id, name: id, pjId: 'pj', products: [], available: true, active: true, maxOpenLeads: 30, openLeads: 10, priority: 0, ...over });
  it('prefere especialista no produto com folga de capacidade e explica o motivo', () => {
    const r = recommendConsultant([c('generalista', { products: [] }), c('especialista', { products: ['IMOVEL'], openLeads: 5 }), c('outro-produto', { products: ['MOTO'] })], { product: 'IMOVEL' })!;
    expect(r.consultantId).toBe('especialista');
    expect(r.reason).toMatch(/especialista no produto/);
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.confidence).toBeLessThanOrEqual(0.95);
  });
  it('entre iguais, escolhe quem tem mais capacidade livre; sem elegíveis, sem sugestão', () => {
    expect(recommendConsultant([c('cheio', { openLeads: 28 }), c('livre', { openLeads: 2 })], { product: null })!.consultantId).toBe('livre');
    expect(recommendConsultant([], { product: 'IMOVEL' })).toBeNull();
  });
});
