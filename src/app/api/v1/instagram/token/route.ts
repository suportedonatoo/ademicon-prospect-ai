import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { connectInstagramWithToken } from '@/modules/instagram/instagram.service';

/** POST /api/v1/instagram/token — conecta colando o token de acesso da conta ({ token, consultantId? }). */
export const POST = authed({ rate: 10 }, async ({ req, ctx }) => {
  const i = z.object({ token: z.string().min(20).max(2000), consultantId: z.string().optional().nullable() }).parse(await body(req));
  return connectInstagramWithToken(ctx, i);
});
