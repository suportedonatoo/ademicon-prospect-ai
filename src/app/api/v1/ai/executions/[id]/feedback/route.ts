import { authed, body } from '@/lib/api';
import { addFeedback } from '@/modules/ai/ai-admin.service';

/** POST /api/v1/ai/executions/:id/feedback — { rating: GOOD | BAD | INCORRECT | NEEDS_REVIEW } */
export const POST = authed<{ id: string }>({ permission: 'ai.feedback' }, async ({ req, ctx, params }) => addFeedback(ctx, params.id, await body(req)));
