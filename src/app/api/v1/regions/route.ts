import { authed, body } from '@/lib/api';
import { listRegions, saveRegion } from '@/modules/pjs/pj.service';

export const GET = authed({ permission: 'pj.read' }, async ({ ctx }) => listRegions(ctx));
export const POST = authed({ permission: 'pj.manage' }, async ({ req, ctx }) => saveRegion(ctx, await body(req)));
