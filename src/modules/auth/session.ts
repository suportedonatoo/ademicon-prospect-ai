import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ctxFromSessionToken, SESSION_TTL_HOURS } from './auth.service';
import { isProduction } from '@/lib/env';
import type { Ctx } from './context';
import { can } from './context';
import type { PermissionKey } from '../roles/permissions';

export const SESSION_COOKIE = 'pa_session';

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
    userAgent: h.get('user-agent'),
  };
}

/** Contexto do usuário logado (páginas server-side). Memoizado por request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return ctxFromSessionToken(token, await requestMeta());
});

/** Exige login (e opcionalmente uma permissão) — redireciona quando não atende. */
export async function requireCtx(permission?: PermissionKey): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (permission && !can(ctx, permission)) redirect('/sem-acesso');
  return ctx;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
