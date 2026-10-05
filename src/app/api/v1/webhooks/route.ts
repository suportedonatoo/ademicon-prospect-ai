import { authed, body } from '@/lib/api';
import { createSubscription, listSubscriptions } from '@/modules/webhooks/webhook.service';

/** GET/POST /api/v1/webhooks — assinaturas de webhooks de saída (eventos do Event Bus). */
export const GET = authed({ permission: 'webhook.manage' }, async ({ ctx }) => listSubscriptions(ctx));
export const POST = authed({ permission: 'webhook.manage' }, async ({ req, ctx }) => createSubscription(ctx, await body(req)));
