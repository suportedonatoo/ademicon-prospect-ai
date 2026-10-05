import { authed, query } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { getConversation } from '@/modules/conversations/conversation.service';

/** GET /api/v1/messages?conversationId= — mensagens de uma conversa (atalho). */
export const GET = authed({ permission: 'conversation.read' }, async ({ req, ctx }) => {
  const { conversationId } = query(req);
  if (!conversationId) throw BadRequest('Informe conversationId.');
  return (await getConversation(ctx, conversationId)).messages;
});
