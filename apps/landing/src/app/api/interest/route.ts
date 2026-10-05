import { gestao } from '@/lib/gestao';
import { landingRoute } from '@/lib/api-route';

/** POST /api/interest — contato após simular: lead MORNO ou QUENTE (callNow) da PJ. */
export const POST = landingRoute({ key: 'interest', limit: 10 }, (site, body) => gestao.interest(site, body));
