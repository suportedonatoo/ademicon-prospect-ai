import { authed } from '@/lib/api';
import { listAgents } from '@/modules/ai/ai-admin.service';

export const GET = authed({ permission: 'ai.read' }, async ({ ctx }) => listAgents(ctx));
