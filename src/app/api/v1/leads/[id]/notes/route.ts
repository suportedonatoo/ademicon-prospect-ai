import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { addLeadNote } from '@/modules/leads/leads.service';

/** POST /api/v1/leads/:id/notes — adiciona nota ao histórico. */
export const POST = authed<{ id: string }>({ permission: 'activity.create' }, async ({ req, ctx, params }) => {
  const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(await body(req));
  return addLeadNote(ctx, params.id, text);
});
