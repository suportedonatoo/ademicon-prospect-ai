import { authed, query } from '@/lib/api';
import { listOpenNba } from '@/modules/lead-intelligence/intelligence-v2.service';

/** GET /api/v1/nba — fila de Next Best Actions abertas (escopo do usuário). */
export const GET = authed({ permission: 'lead.read', device: true }, async ({ req, ctx }) => listOpenNba(ctx, query(req)));
