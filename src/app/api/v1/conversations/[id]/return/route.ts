import { authed } from '@/lib/api';
import { returnToBot } from '@/modules/conversations/conversation.service';

/** POST /api/v1/conversations/:id/return — devolve a conversa para a IA. */
export const POST = authed<{ id: string }>({ permission: 'conversation.handoff' }, async ({ ctx, params }) => returnToBot(ctx, params.id));
