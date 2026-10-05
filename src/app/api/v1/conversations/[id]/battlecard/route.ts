import { authed } from '@/lib/api';
import { battlecard } from '@/modules/copilot/copilot.service';

/** GET /api/v1/conversations/:id/battlecard — painel contextual do consultor. */
export const GET = authed<{ id: string }>({ permission: 'conversation.read' }, async ({ ctx, params }) => battlecard(ctx, params.id));
