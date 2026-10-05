import { authed, body } from '@/lib/api';
import { listTemplates, saveTemplate } from '@/modules/outreach/outreach.service';

/** GET/POST /api/v1/gestao/divulgacao/modelos — modelos de postagem do kit (a gestão cria, revisa e aprova). */
export const GET = authed({ permission: 'campaign.read' }, async ({ ctx }) => listTemplates(ctx));
export const POST = authed({ permission: 'campaign.update', rate: 60 }, async ({ req, ctx }) => saveTemplate(ctx, await body(req)));
