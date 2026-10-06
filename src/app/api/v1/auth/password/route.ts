import { z } from 'zod';
import { authed, body, SESSION_COOKIE } from '@/lib/api';
import { changePassword } from '@/modules/auth/auth.service';

/** POST /api/v1/auth/password — troca a própria senha ({ current, next }). */
export const POST = authed({ rate: 10 }, async ({ req, ctx }) => {
  const i = z.object({ current: z.string().min(1).max(200), next: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres.').max(200) }).parse(await body(req));
  await changePassword(ctx, i, req.cookies.get(SESSION_COOKIE)?.value);
  return { ok: true };
});
