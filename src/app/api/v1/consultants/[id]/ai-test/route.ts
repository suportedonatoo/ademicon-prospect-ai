import { authed, body } from '@/lib/api';
import { testConsultantAi } from '@/modules/ai/consultant-ai-test.service';

/** POST /api/v1/consultants/:id/ai-test — conversa de teste com a IA do consultor ({ profile, message, history }). */
export const POST = authed<{ id: string }>({ rate: 40 }, async ({ req, ctx, params }) => testConsultantAi(ctx, params.id, await body(req)));
