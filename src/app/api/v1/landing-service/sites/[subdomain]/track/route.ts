import { authed, body } from '@/lib/api';
import { trackSiteVisit } from '@/modules/landing-service/landing-service.service';

/** POST /api/v1/landing-service/sites/:subdomain/track — visita (UTM, gclid, referrer) → canal: Google pago x orgânico etc. */
export const POST = authed<{ subdomain: string }>({ permission: 'landing.service', rate: 6000 }, async ({ req, ctx, params }) => trackSiteVisit(ctx, params.subdomain, await body(req)));
