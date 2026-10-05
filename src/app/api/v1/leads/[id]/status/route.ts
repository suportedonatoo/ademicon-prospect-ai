import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { changeLeadStatus } from '@/modules/leads/leads.service';
import { LEAD_STATUS } from '@/modules/leads/catalog';

const schema = z.object({ status: z.enum(Object.keys(LEAD_STATUS) as [keyof typeof LEAD_STATUS]), reason: z.string().max(300).optional() });

/** POST /api/v1/leads/:id/status — transição validada pela máquina de estados. */
export const POST = authed<{ id: string }>({ permission: 'lead.update' }, async ({ req, ctx, params }) => {
  const { status, reason } = schema.parse(await body(req));
  await changeLeadStatus(ctx, params.id, status, reason);
  return { ok: true };
});
