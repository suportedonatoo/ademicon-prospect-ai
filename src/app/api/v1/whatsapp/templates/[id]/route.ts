import { authed, body } from '@/lib/api';
import { saveTemplate, submitTemplate } from '@/modules/whatsapp/whatsapp.service';

/** PATCH — editar (volta para DRAFT). POST — enviar para aprovação no provider. */
export const PATCH = authed<{ id: string }>({ permission: 'whatsapp.configure' }, async ({ req, ctx, params }) => saveTemplate(ctx, await body(req), params.id));
export const POST = authed<{ id: string }>({ permission: 'whatsapp.configure' }, async ({ ctx, params }) => submitTemplate(ctx, params.id));
