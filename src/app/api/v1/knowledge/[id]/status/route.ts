import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setDocumentStatus } from '@/modules/knowledge-base/knowledge.service';

/** POST /api/v1/knowledge/:id/status — DRAFT → REVIEW → APPROVED → PUBLISHED (indexa no RAG) → EXPIRED/ARCHIVED (sai do RAG). ACTIVE = alias legado de PUBLISHED. */
export const POST = authed<{ id: string }>({ permission: 'knowledge.manage' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED', 'ACTIVE']) }).parse(await body(req));
  await setDocumentStatus(ctx, params.id, status);
  return { ok: true };
});
