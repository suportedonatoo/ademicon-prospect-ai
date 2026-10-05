import { authed } from '@/lib/api';
import { getConversation } from '@/modules/conversations/conversation.service';

/** GET /api/v1/conversations/:id — mensagens, resumo, lead e oportunidade. */
export const GET = authed<{ id: string }>({ permission: 'conversation.read' }, async ({ ctx, params }) => getConversation(ctx, params.id));
