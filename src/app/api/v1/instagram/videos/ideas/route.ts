import { authed, body } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { postRuleIdeas } from '@/modules/instagram/post-rules.service';

/** POST /api/v1/instagram/videos/ideas — { consultantId?, message, keywords[] } → 2 ideias da IA. */
export const POST = authed({ rate: 30 }, async ({ req, ctx }) => {
  const raw = (await body(req)) as Record<string, unknown>;
  const id = (typeof raw.consultantId === 'string' && raw.consultantId) || ctx.consultantId;
  if (!id) throw BadRequest('Informe o consultor.');
  return postRuleIdeas(ctx, id, raw);
});
