import { authed, body } from '@/lib/api';
import { visitorChat } from '@/modules/landing-service/visitor-chat.service';

/** POST /api/v1/landing-service/sites/:subdomain/chat — bot do visitante anônimo (FRIO): tira dúvidas, sem dados pessoais. */
export const POST = authed<{ subdomain: string }>({ permission: 'landing.service', rate: 6000 }, async ({ req, ctx, params }) => visitorChat(ctx, params.subdomain, await body(req)));
