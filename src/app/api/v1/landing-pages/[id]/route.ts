import { authed, body } from '@/lib/api';
import { getLanding, saveLanding } from '@/modules/landing-pages/landing.service';

export const GET = authed<{ id: string }>({ permission: 'landing.read' }, async ({ ctx, params }) => getLanding(ctx, params.id));
export const PATCH = authed<{ id: string }>({ permission: 'landing.manage' }, async ({ req, ctx, params }) => saveLanding(ctx, await body(req), params.id));
