import { env } from '@/lib/env';
import { db } from '@/lib/db';
import type { BusinessResult, BusinessSearchFilters, MapsProvider } from '../types';
import { int, pick, rng } from '../mock-random';
import { logger } from '@/lib/logger';
import { boundsAround, googleTypeFor, insideSearch, normalizePlace, type LatLng } from './area-filter';

/**
 * Provedores de mapas. Somente APIs oficiais e licenciadas (Places API / Bing Maps API).
 * NÃO há scraping. Sem chave → mock com empresas FICTÍCIAS.
 */
/** Dia de cobrança do Google (a cota diária e a fatura viram à meia-noite do Pacífico). */
const GOOGLE_DAY = `(now() AT TIME ZONE 'America/Los_Angeles')::date`;

/** Requisições ao Google Places ainda permitidas hoje (teto GOOGLE_MAPS_DAILY_REQUESTS). */
export async function googleRequestsLeft() {
  const rows = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count FROM "ApiUsage" WHERE key = 'google_places' AND day = ${GOOGLE_DAY}`);
  return Math.max(0, env.GOOGLE_MAPS_DAILY_REQUESTS - (rows[0]?.count ?? 0));
}

/** Conta UMA requisição (cada página é cobrada) e recusa quando o teto do dia já foi usado. */
async function takeGoogleRequest() {
  // Só soma quando ainda há saldo: tentativa recusada não entra no contador (antes ele passava de 30).
  const rows = await db.$queryRawUnsafe<{ count: number }[]>(
    `INSERT INTO "ApiUsage" (key, day, count) SELECT 'google_places', ${GOOGLE_DAY}, 1 WHERE ${env.GOOGLE_MAPS_DAILY_REQUESTS} > 0
     ON CONFLICT (key, day) DO UPDATE SET count = "ApiUsage".count + 1 WHERE "ApiUsage".count < ${env.GOOGLE_MAPS_DAILY_REQUESTS} RETURNING count`
  );
  if (!rows.length) throw new Error(`Limite de ${env.GOOGLE_MAPS_DAILY_REQUESTS} buscas por dia no Google atingido. Volta a funcionar amanhã.`);
}

/**
 * GOOGLE MAPS — Places API (New), Text Search oficial. Cobrança por requisição no Google Cloud.
 * Campos pedidos (FieldMask) só os necessários para prospecção.
 */
export class GooglePlacesProvider implements MapsProvider {
  key = 'google_maps';
  name = 'Google Maps (Places API)';
  category = 'maps' as const;
  mode = 'real' as const;

  private async page(textQuery: string, pageSize: number, pageToken?: string, extra: object = {}, mask = FIELD_MASK) {
    await takeGoogleRequest();
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY!, 'X-Goog-FieldMask': mask },
      body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize, ...(pageToken ? { pageToken } : {}), ...extra }),
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

  /** Centro do bairro/cidade, guardado no banco: só a primeira busca de cada lugar gasta uma requisição. */
  private async center(f: BusinessSearchFilters): Promise<LatLng | null> {
    const key = [f.neighborhood, f.city, f.uf].map(normalizePlace).join('|');
    const hit = await db.geoPoint.findUnique({ where: { key } });
    if (hit) return { lat: hit.lat, lng: hit.lng };
    const r = await this.page([f.neighborhood, f.city, f.uf, 'Brasil'].filter(Boolean).join(', '), 1, undefined, {}, 'places.location');
    const loc = r.places?.[0]?.location;
    if (!loc?.latitude || !loc.longitude) return null;
    await db.geoPoint.upsert({ where: { key }, create: { key, lat: loc.latitude, lng: loc.longitude }, update: {} });
    return { lat: loc.latitude, lng: loc.longitude };
  }

  async searchBusinesses(f: BusinessSearchFilters): Promise<BusinessResult[]> {
    const limit = Math.min(f.limit ?? 20, 60);
    const query = `${f.category} em ${[f.neighborhood, f.city, f.uf].filter(Boolean).join(', ')}`;
    // Raio: restringe a busca ao retângulo do círculo e confere a distância de cada resultado.
    const center = f.radiusKm ? await this.center(f) : null;
    const type = googleTypeFor(f.category);
    const extra = {
      ...(center ? { locationRestriction: { rectangle: boundsAround(center, f.radiusKm!) } } : {}),
      ...(type ? { includedType: type, strictTypeFiltering: true } : {}),
    };
    const out: BusinessResult[] = [];
    const dropped: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const r = await this.page(query, 20, token, extra);
      pages++;
      for (const p of r.places ?? []) {
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue; // fechada (temporária ou definitivamente)
        const comp = (t: string) => p.addressComponents?.find((c) => c.types?.includes(t))?.longText;
        const area = insideSearch(
          { city: comp('administrative_area_level_2'), uf: p.addressComponents?.find((c) => c.types?.includes('administrative_area_level_1'))?.shortText, location: p.location?.latitude != null && p.location.longitude != null ? { lat: p.location.latitude, lng: p.location.longitude } : null },
          f,
          center
        );
        if (!area.ok) {
          dropped.push(`${p.displayName?.text ?? p.id}: ${area.why}`);
          continue;
        }
        if (out.length >= limit) break;
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
      // No máximo 3 páginas (60 resultados do Google): o descarte não pode virar gasto sem fim.
    } while (token && out.length < limit && pages < 3);
    if (dropped.length) logger.info('maps.dropped_outside_area', { query, radiusKm: f.radiusKm ?? null, dropped: dropped.slice(0, 20) });
    return out.slice(0, limit);
  }
}

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.addressComponents,places.businessStatus,places.location,nextPageToken';

type GPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
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
