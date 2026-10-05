import { authed } from '@/lib/api';
import { getSite } from '@/modules/landing-service/landing-service.service';

// Serviço de landing das PJs (apps/landing) — autenticado por API key com a permissão `landing.service`.
// O limite é alto porque o serviço concentra o tráfego de todos os visitantes (ele aplica limite por IP).
const RATE = 6000;

/** GET /api/v1/landing-service/sites/:subdomain — conteúdo público da landing da PJ + produtos do simulador. */
export const GET = authed<{ subdomain: string }>({ permission: 'landing.service', rate: RATE }, async ({ ctx, params }) => getSite(ctx, params.subdomain));
