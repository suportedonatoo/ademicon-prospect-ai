import { authed, body } from '@/lib/api';
import { listTemplates, saveTemplate } from '@/modules/whatsapp/whatsapp.service';

/** GET/POST /api/v1/whatsapp/templates — templates (aprovação no provider). */
export const GET = authed({ permission: 'whatsapp.read' }, async ({ ctx }) => listTemplates(ctx));
export const POST = authed({ permission: 'whatsapp.configure' }, async ({ req, ctx }) => saveTemplate(ctx, await body(req)));
