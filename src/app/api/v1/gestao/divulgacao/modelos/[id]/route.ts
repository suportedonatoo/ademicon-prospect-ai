import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { saveTemplate, setTemplateState } from '@/modules/outreach/outreach.service';

/** PUT edita o texto (volta para revisão se mudar); PATCH { approved?, active? } aprova / arquiva. */
export const PUT = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => saveTemplate(ctx, await body(req), params.id));
export const PATCH = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) =>
  setTemplateState(ctx, params.id, z.object({ approved: z.boolean().optional(), active: z.boolean().optional() }).parse(await body(req))),
);
