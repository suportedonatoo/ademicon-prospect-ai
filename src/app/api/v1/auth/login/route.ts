import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, meta, SESSION_COOKIE } from '@/lib/api';
import { login, SESSION_TTL_HOURS } from '@/modules/auth/auth.service';
import { isProduction } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

/** POST /api/v1/auth/login — cria sessão (cookie httpOnly). */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = schema.parse(await req.json());
    const m = meta(req);
    // Anti força bruta: por IP e por conta.
    await rateLimit(`login:ip:${m.ip ?? 'na'}`, 20, 60);
    await rateLimit(`login:email:${email.toLowerCase()}`, 10, 15 * 60);
    const { token, ctx } = await login(email, password, m);
    const res = NextResponse.json({ data: { userId: ctx.userId, name: ctx.userName, role: ctx.roleKey } });
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_HOURS * 3600 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
