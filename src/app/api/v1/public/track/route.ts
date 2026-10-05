import { body, publicRoute } from '@/lib/api';
import { track } from '@/modules/attribution/attribution.service';

/** POST /api/v1/public/track — page view / eventos da landing (cria AttributionSession com UTMs). */
export const POST = publicRoute({ rate: 120, key: 'track' }, async ({ req }) => track(await body(req)));
