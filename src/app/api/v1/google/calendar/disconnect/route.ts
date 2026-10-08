import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { disconnectGoogle } from '@/modules/calendar/google-calendar.service';

/** POST /api/v1/google/calendar/disconnect — desconecta o Google Agenda (o próprio consultor, ou o Super Admin). */
export const POST = authed({ rate: 20 }, async ({ req, ctx }) => {
  const i = z.object({ consultantId: z.string().optional().nullable() }).parse(await body(req));
  await disconnectGoogle(ctx, i.consultantId);
  return { ok: true };
});
