import { authed, body } from '@/lib/api';
import { registerInterest } from '@/modules/landing-service/landing-service.service';

/** POST /api/v1/landing-service/sites/:subdomain/interest — contato após a simulação: lead MORNO (ou QUENTE com callNow) da PJ. */
export const POST = authed<{ subdomain: string }>({ permission: 'landing.service', rate: 6000 }, async ({ req, ctx, params }) => registerInterest(ctx, params.subdomain, await body(req)));
