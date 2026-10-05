import { authed, body } from '@/lib/api';
import { simulateCold } from '@/modules/landing-service/landing-service.service';

/** POST /api/v1/landing-service/sites/:subdomain/simulate — simulação FRIA (sem lead, sem dado pessoal). */
export const POST = authed<{ subdomain: string }>({ permission: 'landing.service', rate: 6000 }, async ({ req, ctx, params }) => simulateCold(ctx, params.subdomain, await body(req)));
