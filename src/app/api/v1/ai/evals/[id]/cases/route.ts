import { authed, body } from '@/lib/api';
import { addCase } from '@/modules/ai/lab.service';

/** POST /api/v1/ai/evals/:id/cases — adicionar caso de teste ao dataset. */
export const POST = authed<{ id: string }>({ permission: 'ai.configure' }, async ({ req, ctx, params }) => addCase(ctx, params.id, await body(req)));
