import { authed, query } from '@/lib/api';
import { listExecutions } from '@/modules/ai/ai-admin.service';

/** GET /api/v1/ai/executions?status= — execuções (executionId, leadId, conversationId, agentId, tempos, status). */
export const GET = authed({ permission: 'ai.read' }, async ({ req, ctx }) => listExecutions(ctx, { status: query(req).status }));
