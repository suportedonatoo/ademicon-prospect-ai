import { authed, body } from '@/lib/api';
import { resolveDuplicate } from '@/modules/leads/duplicates.service';

/** POST /api/v1/duplicates/:id — { action: MERGE (com keepId) | KEEP_BOTH | IGNORE }. Merge preserva histórico. */
export const POST = authed<{ id: string }>({ permission: 'lead.read' }, async ({ req, ctx, params }) => resolveDuplicate(ctx, params.id, await body(req)));
