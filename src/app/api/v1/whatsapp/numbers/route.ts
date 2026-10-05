import { authed, body } from '@/lib/api';
import { listNumbers, saveNumber } from '@/modules/whatsapp/whatsapp.service';

/** GET/POST /api/v1/whatsapp/numbers — números do WhatsApp Hub. */
export const GET = authed({ permission: 'whatsapp.read' }, async ({ ctx }) => listNumbers(ctx));
export const POST = authed({ permission: 'whatsapp.configure' }, async ({ req, ctx }) => saveNumber(ctx, await body(req)));
