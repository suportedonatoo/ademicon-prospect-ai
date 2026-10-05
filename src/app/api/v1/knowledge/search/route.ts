import { authed, query } from '@/lib/api';
import { searchKnowledge } from '@/modules/knowledge-base/knowledge.service';

/** GET /api/v1/knowledge/search?q= — testa a recuperação (RAG) com o score de relevância. */
export const GET = authed({ permission: 'knowledge.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return searchKnowledge(ctx.orgId, q.q ?? '', { topK: Number(q.topK ?? 5), product: q.product });
});
