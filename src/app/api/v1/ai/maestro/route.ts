import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { getConversation } from '@/modules/conversations/conversation.service';
import { receiveInboundMessage } from '@/modules/ai/maestro/maestro.engine';

/** POST /api/v1/ai/maestro — processa uma mensagem do lead pelo Maestro (contexto → memória → KB → agente → supervisor). */
export const POST = authed({ permission: 'conversation.reply', rate: 60 }, async ({ req, ctx }) => {
  const { conversationId, text } = z.object({ conversationId: z.string(), text: z.string().min(1).max(4000) }).parse(await body(req));
  const conv = await getConversation(ctx, conversationId);
  return receiveInboundMessage(ctx.orgId, conv.id, text);
});
