import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { GooglePlacesProvider } from '@/modules/integrations/maps/maps.provider';
import { listProspects, saveSearchResults } from '@/modules/business-prospecting/prospecting.service';
import type { BusinessResult } from '@/modules/integrations/types';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let consultor: Ctx;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('DELETE FROM "ApiUsage"');
  await db.$executeRawUnsafe('DELETE FROM "GeoPoint"');
  A = await createOrg('Org Busca Área');
  consultor = await A.ctx(A.users.consultant);
}, 120_000);
afterEach(() => {
  globalThis.fetch = realFetch;
});

const place = (id: string, name: string, city: string, lat: number, lng: number) => ({
  id,
  displayName: { text: name },
  businessStatus: 'OPERATIONAL',
  nationalPhoneNumber: '(11) 99999-0000',
  location: { latitude: lat, longitude: lng },
  addressComponents: [
    { longText: city, types: ['administrative_area_level_2'] },
    { shortText: 'SP', types: ['administrative_area_level_1'] },
  ],
});

/** Google falso: devolve o centro da cidade e, na busca, uma construtora de Jundiaí e uma imobiliária de Osasco. */
function fakeGoogle(calls: { mask: string; body: Record<string, unknown> }[]) {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const mask = (init.headers as Record<string, string>)['X-Goog-FieldMask'];
    const body = JSON.parse(String(init.body));
    calls.push({ mask, body });
    if (mask === 'places.location') return new Response(JSON.stringify({ places: [{ location: { latitude: -23.1857, longitude: -46.8978 } }] }));
    return new Response(JSON.stringify({ places: [place('a', 'Construtora Serra', 'Jundiaí', -23.2, -46.88), place('b', 'Imobiliária Centro', 'Osasco', -23.5329, -46.7917)] }));
  }) as typeof fetch;
}

describe('Busca no Google com raio', () => {
  it('restringe a área, usa o tipo do Google, descarta fora do raio e guarda o centro da cidade', async () => {
    const calls: { mask: string; body: Record<string, unknown> }[] = [];
    fakeGoogle(calls);
    const res = await new GooglePlacesProvider().searchBusinesses({ category: 'Construtoras', city: 'Jundiaí', uf: 'SP', radiusKm: 5, limit: 20 });
    expect(res.map((r) => r.name)).toEqual(['Construtora Serra']);
    expect(calls[0].mask).toBe('places.location'); // centro da cidade
    expect(calls[1].body).toMatchObject({ includedType: 'general_contractor', strictTypeFiltering: true, locationRestriction: { rectangle: { low: expect.any(Object), high: expect.any(Object) } } });

    // 2ª busca na mesma cidade: o centro vem do banco, sem gastar requisição
    calls.length = 0;
    await new GooglePlacesProvider().searchBusinesses({ category: 'Construtoras', city: 'Jundiaí', uf: 'SP', radiusKm: 5, limit: 20 });
    expect(calls.map((c) => c.mask)).not.toContain('places.location');
  });

  it('sem raio: não pede o centro e fica só com a cidade buscada', async () => {
    const calls: { mask: string; body: Record<string, unknown> }[] = [];
    fakeGoogle(calls);
    const res = await new GooglePlacesProvider().searchBusinesses({ category: 'Transportadoras', city: 'Jundiaí', uf: 'SP', limit: 20 });
    expect(res.map((r) => r.city)).toEqual(['Jundiaí']);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.locationRestriction).toBeUndefined();
    expect(calls[0].body.includedType).toBeUndefined();
  });
});

describe('Empresas coletadas por busca', () => {
  const r = (ref: string, name: string): BusinessResult => ({ name, category: 'Construtoras', city: 'Jundiaí', uf: 'SP', phone: '11999990000', sourceRef: ref });

  it('cada busca mostra só o que devolveu, inclusive empresas que já estavam na base', async () => {
    const userId = A.users.consultant.id;
    const prov = { key: 'google_maps', name: 'Google Maps (mock)', mode: 'mock' };
    const s1 = (await saveSearchResults(A.org.id, prov, { category: 'Construtoras', city: 'Jundiaí', uf: 'SP' }, [r('g:1', 'Alfa'), r('g:2', 'Beta')], userId)).search;
    const s2 = (await saveSearchResults(A.org.id, prov, { category: 'Imobiliárias', city: 'Osasco', uf: 'SP' }, [r('g:3', 'Gama')], userId)).search;
    const s3 = (await saveSearchResults(A.org.id, prov, { category: 'Construtoras', city: 'Jundiaí', uf: 'SP' }, [r('g:2', 'Beta')], userId)).search; // repetida

    const names = async (searchId?: string) => (await listProspects(consultor, { searchId })).items.map((p) => p.name).sort();
    expect(await names(s1.id)).toEqual(['Alfa', 'Beta']);
    expect(await names(s2.id)).toEqual(['Gama']);
    expect(await names(s3.id)).toEqual(['Beta']); // já estava na base e aparece na busca repetida
    expect(await names()).toEqual(['Alfa', 'Beta', 'Gama']);
    expect((await listProspects(consultor, { searchId: 'nao-existe' })).total).toBe(0);
  });

  it('busca que devolve empresa coletada por outra pessoa: aparece marcada, sem ações; busca alheia não abre', async () => {
    const prov = { key: 'google_maps', name: 'Google Maps (mock)', mode: 'mock' };
    const other = (await saveSearchResults(A.org.id, prov, { category: 'Padarias', city: 'Jundiaí', uf: 'SP' }, [r('g:9', 'Delta')], A.users.admin.id)).search;
    const mine = (await saveSearchResults(A.org.id, prov, { category: 'Padarias', city: 'Jundiaí', uf: 'SP' }, [r('g:9', 'Delta')], A.users.consultant.id)).search;
    const res = await listProspects(consultor, { searchId: mine.id });
    expect(res.items.map((p) => [p.name, p.mine])).toEqual([['Delta', false]]);
    expect((await listProspects(consultor, { searchId: other.id })).total).toBe(0);
    expect((await listProspects(consultor)).items.map((p) => p.name)).not.toContain('Delta'); // fora da busca, segue a regra de dono
  });
});
