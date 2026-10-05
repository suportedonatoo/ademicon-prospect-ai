import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { addOpportunityNote, getOpportunity, moveOpportunity, updateOpportunityValue } from '@/modules/opportunities/opportunity.service';

const patch = z.object({ stageKey: z.string().optional(), lostReason: z.string().max(300).optional(), lostCategory: z.string().max(40).optional(), competitor: z.string().max(120).optional(), value: z.coerce.number().int().min(0).optional(), note: z.string().max(2000).optional() });

/** GET /api/v1/opportunities/:id — detalhe com histórico. */
export const GET = authed<{ id: string }>({ permission: 'opportunity.read' }, async ({ ctx, params }) => getOpportunity(ctx, params.id));

/** PATCH /api/v1/opportunities/:id — mover etapa, alterar valor ou anotar. */
export const PATCH = authed<{ id: string }>({ permission: 'opportunity.update' }, async ({ req, ctx, params }) => {
  const input = patch.parse(await body(req));
  if (input.value != null) await updateOpportunityValue(ctx, params.id, input.value);
  if (input.note) await addOpportunityNote(ctx, params.id, input.note);
  if (input.stageKey) return moveOpportunity(ctx, params.id, input.stageKey, input.lostReason, { category: input.lostCategory, competitor: input.competitor });
  return getOpportunity(ctx, params.id);
});
