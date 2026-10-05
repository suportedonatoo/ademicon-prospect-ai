import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/api';
import { logout } from '@/modules/auth/auth.service';

/** POST /api/v1/auth/logout — encerra a sessão. */
export async function POST(req: NextRequest) {
  await logout(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
