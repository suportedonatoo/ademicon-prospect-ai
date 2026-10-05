import { authed } from '@/lib/api';
import { listSites } from '@/modules/landing-service/landing-service.service';

/** GET /api/v1/landing-service/sites — unidades (PJs) com landing no ar, para a página mestre. */
export const GET = authed({ permission: 'landing.service', rate: 6000 }, async ({ ctx }) => listSites(ctx));
