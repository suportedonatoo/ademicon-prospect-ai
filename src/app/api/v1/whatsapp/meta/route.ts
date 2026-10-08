import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { importMetaNumbers, metaStatus, registerMetaNumber, subscribeApp } from '@/modules/whatsapp/meta-setup.service';

/** GET /api/v1/whatsapp/meta — estado da conexão com a Meta e os números da conta WhatsApp Business. */
export const GET = authed({ permission: 'whatsapp.configure' }, async ({ ctx }) => metaStatus(ctx));

/** POST /api/v1/whatsapp/meta — { action: 'subscribe' | 'import' | 'register', numberId?, pin? } */
export const POST = authed({ permission: 'whatsapp.configure', rate: 20 }, async ({ req, ctx }) => {
  const i = z.object({ action: z.enum(['subscribe', 'import', 'register']), numberId: z.string().optional(), pin: z.string().optional() }).parse(await body(req));
  if (i.action === 'subscribe') return subscribeApp(ctx);
  if (i.action === 'import') return importMetaNumbers(ctx);
  return registerMetaNumber(ctx, i.numberId ?? '', i.pin ?? '');
});
