import { gestao } from '@/lib/gestao';
import { landingRoute } from '@/lib/api-route';

/** POST /api/track — visita (UTM, gclid, referrer). O sistema de gestão classifica o canal (Google pago x orgânico). */
export const POST = landingRoute({ key: 'track', limit: 120 }, (site, body) => gestao.track(site, body));
