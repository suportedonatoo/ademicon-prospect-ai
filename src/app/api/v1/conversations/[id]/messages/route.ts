import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { db } from '@/lib/db';
import { getConversation, humanReply } from '@/modules/conversations/conversation.service';
import { receiveInboundMessage } from '@/modules/ai/maestro/maestro.engine';

/** GET /api/v1/conversations/:id/messages */
export const GET = authed<{ id: string }>({ permission: 'conversation.read' }, async ({ ctx, params }) => (await getConversation(ctx, params.id)).messages);

/**
 * POST /api/v1/conversations/:id/messages
 *  { text }                       → resposta do consultor (humano)
 *  { text, simulateInbound: true } → simula mensagem do CLIENTE (WhatsApp mock) e aciona o Maestro
 */
export const POST = authed<{ id: string }>({ permission: 'conversation.reply', rate: 60, idempotent: true }, async ({ req, ctx, params }) => {
  const input = z.object({ text: z.string().min(1).max(4000), simulateInbound: z.boolean().optional() }).parse(await body(req));
  const conv = await getConversation(ctx, params.id);
  if (input.simulateInbound) {
    const result = await receiveInboundMessage(ctx.orgId, conv.id, input.text);
    const messages = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } });
    return { result, messages };
  }
  return humanReply(ctx, conv.id, input.text);
});
