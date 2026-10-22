// FILTRO DE ÁREA da busca no Google: o Text Search devolve empresas "relacionadas" fora da cidade
// (ex.: "Construtoras em Jundiaí" trazia imobiliária de Osasco). Aqui ficam as regras puras:
// retângulo do raio para restringir a busca e conferência de cada resultado na volta.

export interface LatLng {
  lat: number;
  lng: number;
}

export const normalizePlace = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Distância em km (haversine). */
export function distanceKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Retângulo que contém o círculo do raio (o Text Search só aceita retângulo em locationRestriction). */
export function boundsAround(c: LatLng, km: number) {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((c.lat * Math.PI) / 180));
  return { low: { latitude: c.lat - dLat, longitude: c.lng - dLng }, high: { latitude: c.lat + dLat, longitude: c.lng + dLng } };
}

/**
 * Categoria digitada → tipo do Google (Places API, tabela A). Com tipo, a busca usa filtro estrito e
 * não volta imobiliária numa busca de construtora. Sem equivalente seguro, fica só o texto.
 */
const TYPES: [string, string][] = [
  ['construtora', 'general_contractor'],
  ['imobiliaria', 'real_estate_agency'],
  ['odontolog', 'dental_clinic'],
  ['dentista', 'dentist'],
  ['clinica medica', 'doctor'],
  ['oficina', 'car_repair'],
  ['contabil', 'accounting'],
  ['advocacia', 'lawyer'],
  ['advogado', 'lawyer'],
  ['locadora de veiculo', 'car_rental'],
  ['locadoras de veiculo', 'car_rental'],
  ['materiais de construcao', 'hardware_store'],
  ['autopeca', 'auto_parts_store'],
  ['academia', 'gym'],
  ['restaurante', 'restaurant'],
  ['supermercado', 'supermarket'],
  ['farmacia', 'pharmacy'],
  ['hotel', 'lodging'],
  ['pousada', 'lodging'],
  ['pet shop', 'pet_store'],
  ['salao de beleza', 'beauty_salon'],
  ['saloes de beleza', 'beauty_salon'],
  ['padaria', 'bakery'],
  ['concessionaria', 'car_dealer'],
];
export function googleTypeFor(category: string) {
  const c = normalizePlace(category);
  return TYPES.find(([k]) => c.includes(k))?.[1] ?? null;
}

export interface PlaceCheck {
  city?: string | null;
  uf?: string | null;
  location?: LatLng | null;
}

/**
 * O resultado pertence à busca? Com raio: dentro do círculo (a cidade vizinha dentro do raio vale).
 * Sem raio: mesma cidade e UF. Sem dado para conferir, fica (o Google já restringiu a área).
 */
export function insideSearch(p: PlaceCheck, f: { city: string; uf: string; radiusKm?: number }, center: LatLng | null): { ok: boolean; why?: string } {
  if (p.uf && f.uf && p.uf.toUpperCase() !== f.uf.toUpperCase()) return { ok: false, why: `outra UF (${p.uf})` };
  if (center && f.radiusKm && p.location) {
    const d = distanceKm(center, p.location);
    return d <= f.radiusKm ? { ok: true } : { ok: false, why: `a ${d.toFixed(1)} km (raio ${f.radiusKm} km)` };
  }
  if (p.city && normalizePlace(p.city) !== normalizePlace(f.city)) return { ok: false, why: `outra cidade (${p.city})` };
  return { ok: true };
}
