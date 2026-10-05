import { describe, expect, it } from 'vitest';
import { classify, computeScore, DEFAULT_SCORING, inferIntent, mergeScoringConfig } from '@/modules/lead-scoring/scoring-engine';

describe('LeadScoringEngine', () => {
  it('lead vazio pontua zero e é FRIO', () => {
    const r = computeScore({});
    expect(r.score).toBe(0);
    expect(r.temperature).toBe('FRIO');
  });

  it('82 pontos → QUENTE, explicando cada ponto', () => {
    const r = computeScore({
      product: 'IMOVEL',
      desiredValue: 500000,
      city: 'Jundiaí',
      intent: 'HIGH',
      signals: { simulationStarted: true, requestedContact: true, repliedBot: true },
    });
    expect(r.score).toBe(10 + 10 + 10 + 15 + 15 + 12 + 10);
    expect(r.temperature).toBe('QUENTE');
    const hits = r.breakdown.filter((b) => b.hit).map((b) => b.key);
    expect(hits).toEqual(expect.arrayContaining(['product_informed', 'value_informed', 'city_informed', 'simulation_started', 'requested_contact', 'replied_bot', 'high_intent']));
  });

  it('3 faixas configuráveis: Frio / Morno / Quente', () => {
    expect(classify(40)).toBe('FRIO');
    expect(classify(41)).toBe('MORNO');
    expect(classify(70)).toBe('MORNO');
    expect(classify(71)).toBe('QUENTE');
    expect(classify(50, { morno: 20, quente: 50 })).toBe('QUENTE');
  });

  it('configuração antiga de 4 faixas cai no padrão de 3', () => {
    const cfg = mergeScoringConfig({ thresholds: { nutricao: 31, qualificado: 61, altaIntencao: 81 } as never });
    expect(cfg.thresholds).toEqual({ morno: 41, quente: 71 });
  });

  it('quem pediu na landing para ser chamado agora é Quente mesmo com score baixo (e nunca com opt-out)', () => {
    expect(computeScore({ product: 'IMOVEL', landingHeat: 'QUENTE' }).temperature).toBe('QUENTE');
    expect(computeScore({ landingHeat: 'MORNO' }).temperature).toBe('MORNO');
    expect(computeScore({ landingHeat: 'QUENTE', optOut: true }).temperature).toBe('FRIO');
  });

  it('regras desativadas e pontos alterados via configuração', () => {
    const cfg = mergeScoringConfig({ rules: [{ key: 'product_informed', label: '', points: 40, enabled: true }, { key: 'city_informed', label: '', points: 10, enabled: false }] });
    const r = computeScore({ product: 'VEICULO', city: 'Campinas' }, cfg);
    expect(r.score).toBe(40);
  });

  it('opt-out zera a pontuação', () => {
    expect(computeScore({ product: 'IMOVEL', desiredValue: 1, optOut: true }).score).toBe(0);
  });

  it('score nunca passa de 100', () => {
    const cfg = mergeScoringConfig({ rules: DEFAULT_SCORING.rules.map((r) => ({ ...r, points: 50 })) });
    expect(computeScore({ product: 'IMOVEL', desiredValue: 1, city: 'X', email: 'a@b.c' }, cfg).score).toBe(100);
  });

  it('infere intenção pelos sinais', () => {
    expect(inferIntent({ signals: { requestedContact: true } })).toBe('HIGH');
    expect(inferIntent({ signals: { requestedContact: true }, term: 'Mais de 12 meses' })).toBe('MEDIUM');
    expect(inferIntent({ signals: { simulationStarted: true } })).toBe('MEDIUM');
    expect(inferIntent({})).toBe('LOW');
  });
});
