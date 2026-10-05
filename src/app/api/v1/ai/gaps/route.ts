import { authed, query } from '@/lib/api';
import { listGaps } from '@/modules/knowledge-base/knowledge.service';

/** GET /api/v1/ai/gaps — perguntas sem resposta (Knowledge Gap). */
export const GET = authed({ permission: 'ai.read' }, async ({ req, ctx }) => listGaps(ctx, query(req).status ?? 'OPEN'));
