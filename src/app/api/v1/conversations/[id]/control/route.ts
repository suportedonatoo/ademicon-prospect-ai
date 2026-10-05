import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { closeConversation, pauseAI, reopenConversation, resumeAI, takeOver, transferConversation } from '@/modules/conversations/conversation.service';

/** POST /api/v1/conversations/:id/control — HUMAN OVERRIDE: take | pause | resume | close | reopen | transfer (auditado). */
export const POST = authed<{ id: string }>({ permission: 'conversation.handoff' }, async ({ req, ctx, params }) => {
  const i = z.object({ action: z.enum(['take', 'pause', 'resume', 'close', 'reopen', 'transfer']), consultantId: z.string().optional(), reason: z.string().max(200).optional() }).parse(await body(req));
  switch (i.action) {
    case 'take':
      return takeOver(ctx, params.id);
    case 'pause':
      return pauseAI(ctx, params.id);
    case 'resume':
      return resumeAI(ctx, params.id);
    case 'close':
      return closeConversation(ctx, params.id, i.reason);
    case 'reopen':
      return reopenConversation(ctx, params.id);
    case 'transfer':
      return transferConversation(ctx, params.id, z.string().min(1).parse(i.consultantId));
  }
});
