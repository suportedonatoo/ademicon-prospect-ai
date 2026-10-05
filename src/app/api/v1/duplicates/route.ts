import { authed, query } from '@/lib/api';
import { listDuplicates, scanDuplicates } from '@/modules/leads/duplicates.service';

/** GET /api/v1/duplicates — candidatos a duplicidade (níveis EXACT/HIGH/MEDIUM/LOW). */
export const GET = authed({ permission: 'lead.read' }, async ({ req, ctx }) => listDuplicates(ctx, query(req)));

/** POST /api/v1/duplicates — executa a varredura agora (últimos 30 dias). */
export const POST = authed({ permission: 'lead.update', rate: 5 }, async ({ ctx }) => scanDuplicates(ctx.orgId));
