import { env } from '@/lib/env';
import type { BusinessResult, BusinessSearchFilters, MapsProvider } from '../types';
import { int, pick, rng } from '../mock-random';

/**
 * Provedores de mapas. Somente APIs oficiais e licenciadas (Places API / Bing Maps API).
 * NÃO há scraping. Sem chave → mock com empresas FICTÍCIAS.
 */
/**
 * GOOGLE MAPS — Places API (New), Text Search oficial. Cobrança por requisição no Google Cloud.
 * Campos pedidos (FieldMask) só os necessários para prospecção.
 */
export class GooglePlacesProvider implements MapsProvider {
  key = 'google_maps';
  name = 'Google Maps (Places API)';
  category = 'maps' as const;
  mode = 'real' as const;

  private async page(textQuery: string, pageSize: number, pageToken?: string) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY!,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.addressComponents,nextPageToken',
      },
      body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { places?: GPlace[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Places: ${body.error?.message ?? res.status}`);
    return body;
  }

  async healthCheck() {
    try {
      const r = await this.page('padaria em São Paulo SP', 1);
      return { ok: true, mode: this.mode, detail: `Chave válida · ${r.places?.length ?? 0} resultado(s) no teste` };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  async searchBusinesses(f: BusinessSearchFilters): Promise<BusinessResult[]> {
    const limit = Math.min(f.limit ?? 20, 60);
    const query = `${f.category} em ${[f.neighborhood, f.city, f.uf].filter(Boolean).join(', ')}`;
    const out: BusinessResult[] = [];
    let token: string | undefined;
    do {
      const r = await this.page(query, Math.min(20, limit - out.length), token);
      for (const p of r.places ?? []) {
        const comp = (t: string) => p.addressComponents?.find((c) => c.types?.includes(t))?.longText;
        out.push({
          name: p.displayName?.text ?? 'Sem nome',
          category: p.primaryTypeDisplayName?.text ?? f.category,
          address: p.formattedAddress,
          neighborhood: comp('sublocality_level_1') ?? comp('sublocality') ?? f.neighborhood,
          city: comp('administrative_area_level_2') ?? f.city,
          uf: p.addressComponents?.find((c) => c.types?.includes('administrative_area_level_1'))?.shortText ?? f.uf,
          phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber,
          website: p.websiteUri,
          sourceRef: `google_places:${p.id}`,
        });
      }
      token = r.nextPageToken;
    } while (token && out.length < limit);
    return out.slice(0, limit);
  }
}

type GPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
};

/**
 * BING MAPS — Bing Maps REST (Locations + Local Search) oficial.
 * Atenção: a Microsoft está descontinuando o Bing Maps for Enterprise (contas Enterprise até 30/06/2028;
 * contas básicas/gratuitas já encerradas) e indicando o Azure Maps como substituto.
 */
export class BingMapsProvider implements MapsProvider {
  key = 'bing_maps';
  name = 'Bing Maps';
  category = 'maps' as const;
  mode = 'real' as const;
  private base = 'https://dev.virtualearth.net/REST/v1';

  private async get<T>(path: string, params: Record<string, string>) {
    const url = new URL(`${this.base}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: env.BING_MAPS_API_KEY! })) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const body = (await res.json().catch(() => ({}))) as T & { errorDetails?: string[]; statusDescription?: string };
    if (!res.ok) throw new Error(`Bing Maps: ${body.errorDetails?.join(' ') ?? body.statusDescription ?? res.status}`);
    return body;
  }

  private async locate(city: string, uf: string) {
    const r = await this.get<{ resourceSets?: { resources?: { point?: { coordinates?: [number, number] } }[] }[] }>('Locations', { locality: city, adminDistrict: uf, countryRegion: 'BR', maxResults: '1' });
    const c = r.resourceSets?.[0]?.resources?.[0]?.point?.coordinates;
    if (!c) throw new Error(`Bing Maps não encontrou a cidade ${city}/${uf}.`);
    return c;
  }

  async healthCheck() {
    try {
      await this.locate('São Paulo', 'SP');
      return { ok: true, mode: this.mode, detail: 'Chave válida (Bing Maps REST)' };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  async searchBusinesses(f: BusinessSearchFilters): Promise<BusinessResult[]> {
    const [lat, lon] = await this.locate(f.city, f.uf);
    const radius = Math.round((f.radiusKm ?? 10) * 1000);
    const r = await this.get<{ resourceSets?: { resources?: BingPlace[] }[] }>('LocalSearch/', {
      query: [f.category, f.neighborhood].filter(Boolean).join(' '),
      userLocation: `${lat},${lon},${radius}`,
      maxResults: String(Math.min(f.limit ?? 20, 25)),
      culture: 'pt-BR',
    });
    return (r.resourceSets?.[0]?.resources ?? []).map((p, i) => ({
      name: p.name ?? 'Sem nome',
      category: p.entityType ?? f.category,
      address: p.Address?.formattedAddress ?? p.Address?.addressLine,
      city: p.Address?.locality ?? f.city,
      uf: f.uf,
      phone: p.PhoneNumber,
      website: p.Website,
      sourceRef: `bing:${p.name ?? i}:${p.Address?.formattedAddress ?? ''}`.slice(0, 190),
    }));
  }
}

type BingPlace = { name?: string; entityType?: string; PhoneNumber?: string; Website?: string; Address?: { formattedAddress?: string; addressLine?: string; locality?: string } };

const PREFIX = ['Grupo', 'Casa', 'Studio', 'Centro', 'Oficina', 'Clínica', 'Mercado', 'Auto', 'Construtora', 'Escritório'];
const CORE = ['Horizonte', 'Aurora', 'Vale Verde', 'Nova Era', 'Primavera', 'Atlântico', 'Serra Azul', 'Bela Vista', 'Monte Real', 'Pioneira', 'Estrela', 'Rio Claro'];
const STREETS = ['Rua das Palmeiras', 'Av. Brasil', 'Rua XV de Novembro', 'Av. Independência', 'Rua São José', 'Rua das Flores', 'Av. Central'];
const HOODS = ['Centro', 'Vila Nova', 'Jardim América', 'Anhangabaú', 'Vila Arens', 'Eloy Chaves', 'Parque Industrial'];
const SIZES = ['MEI', 'ME', 'EPP', 'Demais'];

export class MockMapsProvider implements MapsProvider {
  category = 'maps' as const;
  mode = 'mock' as const;
  constructor(public key: string, public name: string) {}
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Resultados fictícios gerados para demonstração.' };
  }
  async searchBusinesses(f: BusinessSearchFilters): Promise<BusinessResult[]> {
    const r = rng(`${this.key}:${f.category}:${f.city}:${f.uf}:${f.neighborhood ?? ''}`);
    const n = Math.min(f.limit ?? 20, int(r, 8, 24));
    return Array.from({ length: n }, (_, i) => {
      const name = `${pick(r, PREFIX)} ${pick(r, CORE)} ${f.category.split(' ')[0]}`;
      const hood = f.neighborhood || pick(r, HOODS);
      return {
        name,
        category: f.category,
        address: `${pick(r, STREETS)}, ${int(r, 10, 2400)}`,
        neighborhood: hood,
        city: f.city,
        uf: f.uf,
        phone: `(11) 9${int(r, 1000, 9999)}-${int(r, 1000, 9999)}`,
        website: r() > 0.5 ? `https://www.${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.exemplo.com.br` : undefined,
        size: f.size || pick(r, SIZES),
        sourceRef: `${this.key}-mock-${i}-${Math.floor(r() * 1e6)}`,
      };
    });
  }
}

export function createGoogleMapsProvider(): MapsProvider {
  return env.GOOGLE_MAPS_API_KEY ? new GooglePlacesProvider() : new MockMapsProvider('google_maps', 'Google Maps (mock)');
}
export function createBingMapsProvider(): MapsProvider {
  return env.BING_MAPS_API_KEY ? new BingMapsProvider() : new MockMapsProvider('bing_maps', 'Bing Maps (mock)');
}
