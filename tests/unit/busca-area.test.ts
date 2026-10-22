import { describe, expect, it } from 'vitest';
import { boundsAround, distanceKm, googleTypeFor, insideSearch } from '@/modules/integrations/maps/area-filter';

const JUNDIAI = { lat: -23.1857, lng: -46.8978 };
const OSASCO = { lat: -23.5329, lng: -46.7917 };

describe('Busca no Google — filtro de área', () => {
  it('distância e retângulo do raio', () => {
    expect(distanceKm(JUNDIAI, OSASCO)).toBeGreaterThan(35);
    expect(distanceKm(JUNDIAI, OSASCO)).toBeLessThan(45);
    const b = boundsAround(JUNDIAI, 5);
    // os cantos do retângulo ficam a ~5 km do centro em cada eixo
    expect(distanceKm(JUNDIAI, { lat: b.high.latitude, lng: JUNDIAI.lng })).toBeCloseTo(5, 1);
    expect(distanceKm(JUNDIAI, { lat: JUNDIAI.lat, lng: b.high.longitude })).toBeCloseTo(5, 1);
  });

  it('"Construtoras, Jundiaí, raio 5 km" descarta a imobiliária de Osasco', () => {
    const f = { city: 'Jundiaí', uf: 'SP', radiusKm: 5 };
    expect(insideSearch({ city: 'Osasco', uf: 'SP', location: OSASCO }, f, JUNDIAI)).toMatchObject({ ok: false, why: expect.stringMatching(/km \(raio 5 km\)/) });
    expect(insideSearch({ city: 'Jundiaí', uf: 'SP', location: { lat: -23.2, lng: -46.88 } }, f, JUNDIAI).ok).toBe(true);
    // cidade vizinha DENTRO do raio vale (o consultor escolheu o raio)
    expect(insideSearch({ city: 'Várzea Paulista', uf: 'SP', location: { lat: -23.21, lng: -46.86 } }, f, JUNDIAI).ok).toBe(true);
  });

  it('sem raio: só a cidade (sem acento e sem caixa) e a UF', () => {
    const f = { city: 'Jundiaí', uf: 'SP' };
    expect(insideSearch({ city: 'JUNDIAI', uf: 'SP' }, f, null).ok).toBe(true);
    expect(insideSearch({ city: 'Osasco', uf: 'SP' }, f, null)).toEqual({ ok: false, why: 'outra cidade (Osasco)' });
    expect(insideSearch({ city: 'Jundiaí', uf: 'MG' }, f, null).ok).toBe(false);
    expect(insideSearch({}, f, null).ok).toBe(true); // sem dado para conferir: o Google já restringiu
  });

  it('categoria vira tipo do Google quando há equivalente seguro', () => {
    expect(googleTypeFor('Construtoras')).toBe('general_contractor');
    expect(googleTypeFor('imobiliárias')).toBe('real_estate_agency');
    expect(googleTypeFor('Clínicas odontológicas')).toBe('dental_clinic');
    expect(googleTypeFor('Transportadoras')).toBeNull(); // sem tipo seguro: só o texto
  });
});
