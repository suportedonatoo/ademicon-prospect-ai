import { authed, body, query } from '@/lib/api';
import { listLeads } from '@/modules/leads/leads.service';
import { ingestLead } from '@/modules/leads/lead-engine';

/** GET /api/v1/leads — lista paginada com filtros server-side. */
export const GET = authed({ permission: 'lead.read' }, async ({ req, ctx }) => listLeads(ctx, query(req)));

/** POST /api/v1/leads — cria lead (validação, normalização e deduplicação). */
export const POST = authed({ permission: 'lead.create', idempotent: true }, async ({ req, ctx }) => ingestLead(ctx, { source: 'API', ...(await body<Record<string, unknown>>(req)) }));
