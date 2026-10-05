import { authed } from '@/lib/api';
import { takeOver } from '@/modules/conversations/conversation.service';

/** POST /api/v1/conversations/:id/takeover — consultor assume (bot PAUSED, humano ACTIVE). */
export const POST = authed<{ id: string }>({ permission: 'conversation.handoff' }, async ({ ctx, params }) => takeOver(ctx, params.id));
