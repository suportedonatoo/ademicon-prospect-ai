import { authed, body } from '@/lib/api';
import { listRules, saveRule } from '@/modules/lead-routing/rules.service';

export const GET = authed({ permission: 'routing.read' }, async ({ ctx }) => listRules(ctx));
export const POST = authed({ permission: 'routing.configure' }, async ({ req, ctx }) => saveRule(ctx, await body(req)));
