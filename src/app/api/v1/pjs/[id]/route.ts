import { authed, body } from '@/lib/api';
import { getPj, savePj } from '@/modules/pjs/pj.service';

export const GET = authed<{ id: string }>({ permission: 'pj.read' }, async ({ ctx, params }) => getPj(ctx, params.id));
export const PATCH = authed<{ id: string }>({ permission: 'pj.manage' }, async ({ req, ctx, params }) => savePj(ctx, await body(req), params.id));
