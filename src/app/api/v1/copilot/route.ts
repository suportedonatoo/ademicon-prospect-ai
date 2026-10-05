import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { copilot } from '@/modules/copilot/copilot.service';

/** POST /api/v1/copilot — { leadId, action: SUMMARIZE | SUGGEST_REPLY | ANALYZE_OBJECTION | NEXT_ACTION | ANALYZE_OPPORTUNITY }. Nada é enviado ao cliente. */
export const POST = authed({ permission: 'conversation.read', rate: 30 }, async ({ req, ctx }) => {
  const i = z.object({ leadId: z.string(), action: z.enum(['SUMMARIZE', 'SUGGEST_REPLY', 'ANALYZE_OBJECTION', 'NEXT_ACTION', 'ANALYZE_OPPORTUNITY']) }).parse(await body(req));
  return copilot(ctx, i.leadId, i.action);
});
