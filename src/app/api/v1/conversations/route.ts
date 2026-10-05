import { authed, query } from '@/lib/api';
import { listConversations } from '@/modules/conversations/conversation.service';

/** GET /api/v1/conversations?mode=AI|HUMAN&q= — inbox. */
export const GET = authed({ permission: 'conversation.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return listConversations(ctx, { mode: q.mode, q: q.q });
});
