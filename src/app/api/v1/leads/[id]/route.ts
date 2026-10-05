import { authed, body } from '@/lib/api';
import { deleteLead, getLeadDetail, updateLead } from '@/modules/leads/leads.service';

/** GET /api/v1/leads/:id — Lead DNA completo. */
export const GET = authed<{ id: string }>({ permission: 'lead.read' }, async ({ ctx, params }) => getLeadDetail(ctx, params.id));

/** PATCH /api/v1/leads/:id — atualiza dados de identidade/interesse. */
export const PATCH = authed<{ id: string }>({ permission: 'lead.update' }, async ({ req, ctx, params }) => updateLead(ctx, params.id, await body(req)));

/** DELETE /api/v1/leads/:id — exclusão lógica. */
export const DELETE = authed<{ id: string }>({ permission: 'lead.delete' }, async ({ ctx, params }) => {
  await deleteLead(ctx, params.id);
  return { ok: true };
});
