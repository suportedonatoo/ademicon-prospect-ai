import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setPromptStatus } from '@/modules/ai/prompt-versions.service';

/** POST /api/v1/ai/prompts/:id/status — DRAFT | TESTING | ACTIVE (publica em produção) | ARCHIVED. */
export const POST = authed<{ id: string }>({ permission: 'ai.configure' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'TESTING', 'ACTIVE', 'ARCHIVED']) }).parse(await body(req));
  return setPromptStatus(ctx, params.id, status);
});
