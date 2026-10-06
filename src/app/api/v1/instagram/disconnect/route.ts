import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { disconnectInstagram } from '@/modules/instagram/instagram.service';

/** POST /api/v1/instagram/disconnect — desconecta o Instagram do consultor (ele mesmo, ou o Super Admin). */
export const POST = authed({ rate: 20 }, async ({ req, ctx }) => {
  const i = z.object({ consultantId: z.string().optional().nullable() }).parse(await body(req));
  await disconnectInstagram(ctx, i.consultantId);
  return { ok: true };
});
