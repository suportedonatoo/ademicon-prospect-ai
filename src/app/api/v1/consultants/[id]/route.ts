import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { saveConsultant, setAvailability } from '@/modules/consultants/consultant.service';

/** PATCH /api/v1/consultants/:id — edição completa ou { available } (o próprio consultor pode alterar sua disponibilidade). */
export const PATCH = authed<{ id: string }>({}, async ({ req, ctx, params }) => {
  const input = await body<Record<string, unknown>>(req);
  if (Object.keys(input).length === 1 && 'available' in input) {
    await setAvailability(ctx, params.id, z.boolean().parse(input.available));
    return { ok: true };
  }
  return saveConsultant(ctx, input, params.id);
});
