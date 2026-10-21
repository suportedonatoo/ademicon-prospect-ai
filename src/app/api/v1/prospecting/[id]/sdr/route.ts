import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { handoff, registerTouch, saveQualification, startCadence } from '@/modules/business-prospecting/sdr.service';

/**
 * POST /api/v1/prospecting/:id/sdr
 *   { action: 'start' } | { action: 'touch', result, note? } | { action: 'qualify', ...respostas } | { action: 'handoff' }
 */
export const POST = authed<{ id: string }>({ permission: 'prospecting.convert' }, async ({ req, ctx, params }) => {
  // Os schemas de cada ação descartam campos a mais (inclusive "action").
  const raw = await body(req);
  const { action } = z.object({ action: z.enum(['start', 'touch', 'qualify', 'handoff']) }).parse(raw);
  if (action === 'start') return startCadence(ctx, params.id).then(() => ({ ok: true }));
  if (action === 'touch') return registerTouch(ctx, params.id, raw);
  if (action === 'qualify') return saveQualification(ctx, params.id, raw);
  return handoff(ctx, params.id);
});
