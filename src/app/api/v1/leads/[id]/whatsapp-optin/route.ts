import { authed } from '@/lib/api';
import { registerVerbalWhatsAppOptIn } from '@/modules/messaging/whatsapp-contact.service';

/** POST /api/v1/leads/:id/whatsapp-optin — o consultor registra que o cliente aceitou contato por WhatsApp. */
export const POST = authed<{ id: string }>({ rate: 30 }, async ({ ctx, params }) => registerVerbalWhatsAppOptIn(ctx, params.id));
