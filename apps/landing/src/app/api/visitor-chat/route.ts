import { gestao } from '@/lib/gestao';
import { landingRoute } from '@/lib/api-route';

/** POST /api/visitor-chat — bot do visitante anônimo ("Simular apenas" → FRIO). */
export const POST = landingRoute({ key: 'visitor-chat', limit: 20 }, (site, body) => gestao.visitorChat(site, body));
