import { authed, body } from '@/lib/api';
import { listLandings, saveLanding } from '@/modules/landing-pages/landing.service';

export const GET = authed({ permission: 'landing.read' }, async ({ ctx }) => listLandings(ctx));
export const POST = authed({ permission: 'landing.manage' }, async ({ req, ctx }) => saveLanding(ctx, await body(req)));
