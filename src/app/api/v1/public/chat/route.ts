import { z } from 'zod';
import { body, publicRoute } from '@/lib/api';
import { publicChatOpen, publicChatSend } from '@/modules/conversations/public-chat.service';

/** POST /api/v1/public/chat — { token } abre o chat; { token, text } envia mensagem ao Maestro. */
export const POST = publicRoute({ rate: 40, key: 'chat' }, async ({ req, meta }) => {
  const input = z.object({ token: z.string().max(1000), text: z.string().max(1000).optional() }).parse(await body(req));
  return input.text ? publicChatSend(input.token, input.text, meta.ip) : publicChatOpen(input.token);
});
