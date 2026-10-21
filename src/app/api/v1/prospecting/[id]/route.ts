import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { convertProspect, discardProspect, recordOutcome } from '@/modules/business-prospecting/prospecting.service';

/** POST /api/v1/prospecting/:id — { action: 'convert', product? } | { action: 'discard' } | { action: 'outcome', outcome } */
export const POST = authed<{ id: string }>({ permission: 'prospecting.convert' }, async ({ req, ctx, params }) => {
  const input = z.object({ action: z.enum(['convert', 'discard', 'outcome']), product: z.string().optional(), outcome: z.string().optional() }).parse(await body(req));
  if (input.action === 'outcome') {
    await recordOutcome(ctx, params.id, input.outcome ?? '');
    return { ok: true };
  }
  if (input.action === 'discard') {
    await discardProspect(ctx, params.id);
    return { ok: true };
  }
  return convertProspect(ctx, params.id, input.product);
});
