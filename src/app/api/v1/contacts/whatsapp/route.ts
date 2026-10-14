import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { registerWhatsAppContact } from '@/modules/messaging/whatsapp-contact.service';

/** POST /api/v1/contacts/whatsapp — { leadId } ou { prospectId }: conta o contato no limite diário do consultor. */
export const POST = authed({ rate: 120 }, async ({ req, ctx }) =>
  registerWhatsAppContact(ctx, z.object({ leadId: z.string().max(40).optional(), prospectId: z.string().max(40).optional() }).parse(await body(req)))
);
