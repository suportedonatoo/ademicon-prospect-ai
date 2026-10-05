import { authed } from '@/lib/api';
import { listPlaybooks } from '@/modules/ai/ai-admin.service';

export const GET = authed({ permission: 'ai.read' }, async ({ ctx }) => listPlaybooks(ctx));
