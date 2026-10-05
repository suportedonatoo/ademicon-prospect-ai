import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/modules/automations/automation.engine';
import { backoffMs, sign } from '@/modules/webhooks/webhook.service';
import { sourceFromUtm } from '@/modules/simulators/simulator.service';
import { signToken, verifyToken } from '@/lib/signed-token';

describe('Attribution', () => {
  it('mapeia utm_source/gclid para a origem do lead', () => {
    expect(sourceFromUtm('google', true)).toBe('GOOGLE_ADS');
    expect(sourceFromUtm('Facebook', true)).toBe('META');
    expect(sourceFromUtm('instagram', true)).toBe('INSTAGRAM');
    expect(sourceFromUtm(null, true)).toBe('LANDING');
    expect(sourceFromUtm(null, false)).toBe('SIMULATOR');
  });
});

describe('Automation Engine', () => {
  const ctx = { event: { score: 85 }, lead: { temperature: 'QUENTE', source: 'META' } };
  it('avalia condições', () => {
    expect(evaluateCondition({ field: 'event.score', op: 'gte', value: 81 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'event.score', op: 'lt', value: 50 }, ctx)).toBe(false);
    expect(evaluateCondition({ field: 'lead.source', op: 'in', value: ['META', 'INSTAGRAM'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'lead.temperature', op: 'eq', value: 'FRIO' }, ctx)).toBe(false);
  });
});

describe('Webhooks e tokens', () => {
  it('assinatura HMAC determinística e backoff exponencial limitado', () => {
    expect(sign('s', '{"a":1}', '100')).toBe(sign('s', '{"a":1}', '100'));
    expect(sign('s', '{"a":1}', '100')).not.toBe(sign('outro', '{"a":1}', '100'));
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([120000, 240000, 480000, 3600000]);
  });
  it('token assinado rejeita adulteração', () => {
    const t = signToken({ l: 'lead1' });
    expect(verifyToken<{ l: string }>(t)?.l).toBe('lead1');
    expect(verifyToken(t.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
  });
});
