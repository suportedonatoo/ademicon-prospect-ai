import { gestao } from '@/lib/gestao';
import { landingRoute } from '@/lib/api-route';

/** POST /api/simulate — simulação (FRIO: não cria lead). */
export const POST = landingRoute({ key: 'simulate', limit: 30 }, (site, body) => gestao.simulate(site, body));
