import { authed, body } from '@/lib/api';
import { listRules, saveRule } from '@/modules/automations/automation.engine';

/** Automation Engine: Trigger → Condition → Action. */
export const GET = authed({ permission: 'automation.manage' }, async ({ ctx }) => listRules(ctx));
export const POST = authed({ permission: 'automation.manage' }, async ({ req, ctx }) => saveRule(ctx, await body(req)));
