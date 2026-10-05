import crypto from 'node:crypto';
import { env } from './env';

// Token assinado (HMAC) para acesso público limitado — ex.: chat da landing page.
export function signToken(payload: Record<string, unknown>, ttlSeconds = 60 * 60 * 24): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number };
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}
