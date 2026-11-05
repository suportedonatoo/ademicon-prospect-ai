import { describe, expect, it } from 'vitest';
import { passesQuality, prospectQuality, qualityLevel, startOfDayBrasilia } from '@/modules/business-prospecting/prospecting.service';

const base = { name: 'X', category: 'Construtoras', city: 'Jundiaí', uf: 'SP', sourceRef: 'google_places:1' };

describe('Qualidade do contato na prospecção', () => {
  it('celular + empresa estabelecida + boa nota + site = Alta; fixo sem avaliações = Baixa', () => {
    expect(qualityLevel(prospectQuality({ phone: '11987654321', website: 'https://x.com.br', rating: 4.6, reviews: 80 }))).toBe('Alta');
    expect(qualityLevel(prospectQuality({ phone: '1133334444', website: null, rating: null, reviews: null }))).toBe('Baixa');
    expect(prospectQuality({ phone: '11987654321', reviews: 80, rating: 4.6 })).toBeGreaterThan(prospectQuality({ phone: '1133334444', reviews: 80, rating: 4.6 }));
  });

  it('filtros: só celular, só com site, avaliações e nota mínimas', () => {
    const cel = { ...base, phone: '(11) 98765-4321', website: 'https://x.com.br', rating: 4.5, reviews: 30 };
    const fixo = { ...base, phone: '(11) 3333-4444', rating: 4.8, reviews: 200 };
    expect(passesQuality(cel, { onlyMobile: true, onlyWebsite: true, minReviews: 20, minRating: 4 })).toBe(true);
    expect(passesQuality(fixo, { onlyMobile: true })).toBe(false);
    expect(passesQuality(fixo, { onlyWebsite: true })).toBe(false);
    expect(passesQuality(cel, { minReviews: 50 })).toBe(false);
    expect(passesQuality(cel, { minRating: 4.6 })).toBe(false);
    expect(passesQuality({ ...base }, {})).toBe(true);
  });
});

describe('startOfDayBrasilia', () => {
  it('vira o dia à meia-noite de Brasília, não à meia-noite UTC', () => {
    // 05/11 às 23h em Brasília = 06/11 02:00 UTC → ainda é dia 05 em Brasília
    expect(startOfDayBrasilia(new Date('2026-11-06T02:00:00Z')).toISOString()).toBe('2026-11-05T03:00:00.000Z');
    // 06/11 às 00h30 em Brasília = 06/11 03:30 UTC → já é dia 06
    expect(startOfDayBrasilia(new Date('2026-11-06T03:30:00Z')).toISOString()).toBe('2026-11-06T03:00:00.000Z');
  });
});
