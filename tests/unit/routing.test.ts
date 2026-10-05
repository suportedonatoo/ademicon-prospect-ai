import { describe, expect, it } from 'vitest';
import { filterCandidates, matchRule, selectConsultant, type Candidate, type RoutingRuleLike } from '@/modules/lead-routing/routing-engine';

const rule = (over: Partial<RoutingRuleLike> = {}): RoutingRuleLike => ({ id: 'r1', name: 'Regra', priority: 10, active: true, conditions: {}, pjIds: [], method: 'ROUND_ROBIN', ...over });
const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({ id, name: id, pjId: 'pjA', products: ['IMOVEL'], available: true, active: true, maxOpenLeads: 10, openLeads: 0, priority: 0, ...over });

describe('LeadRoutingEngine', () => {
  it('casa regra por produto + região e explica o motivo', () => {
    const r = rule({ conditions: { products: ['IMOVEL'], regionIds: ['jdi'] } });
    expect(matchRule(r, { product: 'IMOVEL', regionId: 'jdi' }).matched).toBe(true);
    const miss = matchRule(r, { product: 'VEICULO', regionId: 'jdi' });
    expect(miss.matched).toBe(false);
    expect(miss.reasons.join(' ')).toMatch(/não atende/);
  });

  it('cidade é comparada sem acento/caixa e score mínimo é respeitado', () => {
    const r = rule({ conditions: { cities: ['Jundiaí'], minScore: 60 } });
    expect(matchRule(r, { city: 'jundiai', score: 70 }).matched).toBe(true);
    expect(matchRule(r, { city: 'jundiai', score: 50 }).matched).toBe(false);
  });

  it('filtra por disponibilidade, especialização, PJ e capacidade', () => {
    const { eligible, rejected } = filterCandidates(
      [cand('ok'), cand('indisp', { available: false }), cand('semEsp', { products: ['VEICULO'] }), cand('cheio', { openLeads: 10 }), cand('outraPj', { pjId: 'pjB' }), cand('capRegra', { openLeads: 5 })],
      { product: 'IMOVEL', pjIds: ['pjA'], capacity: 5 }
    );
    expect(eligible.map((e) => e.id)).toEqual(['ok']);
    expect(rejected.map((r) => r.reason)).toEqual(expect.arrayContaining(['indisponível', 'sem especialização no produto', 'PJ fora da regra']));
  });

  it('Round Robin alterna entre consultores elegíveis', () => {
    const list = [cand('a'), cand('b'), cand('c')];
    const picks = [0, 1, 2, 3].map((p) => selectConsultant(list, 'ROUND_ROBIN', p)!.id);
    expect(picks).toEqual(['a', 'b', 'c', 'a']);
  });

  it('menor carga e prioridade', () => {
    const list = [cand('a', { openLeads: 8 }), cand('b', { openLeads: 2 }), cand('c', { openLeads: 5, priority: 9 })];
    expect(selectConsultant(list, 'LEAST_LOAD', 0)!.id).toBe('b');
    expect(selectConsultant(list, 'PRIORITY', 0)!.id).toBe('c');
    expect(selectConsultant(list, 'SPECIFIC_CONSULTANT', 0, 'a')!.id).toBe('a');
    expect(selectConsultant([], 'ROUND_ROBIN', 0)).toBeNull();
  });
});
