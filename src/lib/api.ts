import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AppError, Forbidden, isAppError, Unauthorized } from './errors';
import { logger } from './logger';
import { env } from './env';
import { withIdempotency } from './idempotency';
import { rateLimit } from './rate-limit';
import type { Ctx } from '@/modules/auth/context';
import { can } from '@/modules/auth/context';
import type { PermissionKey } from '@/modules/roles/permissions';
import { ctxFromApiKey, ctxFromSessionToken } from '@/modules/auth/auth.service';
import { ctxFromDeviceToken } from '@/modules/devices/device.service';
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'pa_session';

/**
 * IP do cliente. O X-Forwarded-For é "cliente, proxy1, proxy2…" e os valores à ESQUERDA podem ser
 * forjados por quem faz a requisição. Por isso usamos o valor acrescentado pelo proxy confiável mais
 * externo (TRUSTED_PROXY_HOPS contado a partir da direita) — base do rate limit e da auditoria.
 */
export function clientIp(req: NextRequest): string | null {
  const hops = env.TRUSTED_PROXY_HOPS;
  const xff = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops > 0 && xff.length) return xff[Math.max(0, xff.length - hops)];
  return req.headers.get('x-real-ip') || null;
}

export function meta(req: NextRequest) {
  return { ip: clientIp(req), userAgent: req.headers.get('user-agent') };
}

/** Resolve o contexto: cookie de sessão (UI), "Bearer pk_..." (integrações) ou "Device dx_..." (extensão). */
export async function resolveCtx(req: NextRequest): Promise<Ctx | null> {
  const m = meta(req);
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return ctxFromApiKey(auth.slice(7).trim(), m);
  if (auth?.startsWith('Device ')) return ctxFromDeviceToken(auth.slice(7).trim(), m);
  return ctxFromSessionToken(req.cookies.get(SESSION_COOKIE)?.value, m);
}

/** Identificadores de rastreio ponta a ponta (requestId/traceId), devolvidos nos cabeçalhos. */
function traceIds(req: NextRequest) {
  const incoming = req.headers.get('traceparent')?.split('-')[1];
  return { requestId: crypto.randomUUID(), traceId: incoming && /^[0-9a-f]{32}$/.test(incoming) ? incoming : crypto.randomBytes(16).toString('hex') };
}

/** CSRF: mutações autenticadas por cookie precisam vir da mesma origem. */
function assertSameOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers.get('authorization')) return; // API key não usa cookie
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && host && new URL(origin).host !== host) throw Forbidden('Origem da requisição não permitida (CSRF).');
  if (!origin && req.headers.get('sec-fetch-site') === 'cross-site') throw Forbidden('Origem da requisição não permitida (CSRF).');
}

export function errorResponse(e: unknown, ids?: { requestId: string; traceId: string }) {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: e.flatten() } }, { status: 400 });
  }
  if (isAppError(e)) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  // Erro inesperado: o usuário recebe mensagem amigável + ID técnico; o detalhe fica só no log.
  const errorId = ids?.requestId ?? crypto.randomUUID();
  logger.error('api.unhandled', { errorId, traceId: ids?.traceId, error: String(e), stack: (e as Error)?.stack?.split('\n').slice(0, 4).join(' | ') });
  return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.', errorId } }, { status: 500 });
}

function withIds(res: Response, ids: { requestId: string; traceId: string }) {
  res.headers.set('x-request-id', ids.requestId);
  res.headers.set('x-trace-id', ids.traceId);
  return res;
}

type RouteParams = Record<string, string>;
type Handler<P extends RouteParams> = (args: { req: NextRequest; ctx: Ctx; params: P }) => Promise<unknown>;

/**
 * Rota autenticada. `permission` é verificada antes do handler (os serviços verificam de novo).
 * `device: true` libera a rota para o token da extensão (somente rotas de leitura rápida).
 */
export function authed<P extends RouteParams = RouteParams>(opts: { permission?: PermissionKey; rate?: number; device?: boolean; idempotent?: boolean }, fn: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const ids = traceIds(req);
    try {
      assertSameOrigin(req);
      const ctx = await resolveCtx(req);
      if (!ctx) throw Unauthorized();
      if (ctx.via === 'device' && !opts.device) throw Forbidden('Esta operação não está disponível para a extensão.');
      // Limite global por usuário + limite próprio da rota (contadores separados).
      await rateLimit(`api:${ctx.userId ?? ctx.userName}`, 300, 60);
      if (opts.rate) await rateLimit(`api:${ctx.userId ?? ctx.userName}:${req.method}:${req.nextUrl.pathname}`, opts.rate, 60);
      if (opts.permission && !can(ctx, opts.permission)) throw Forbidden(`Permissão necessária: ${opts.permission}`);
      const params = await context.params;
      // Idempotency-Key (opcional) nas rotas que criam registros ou enviam mensagens.
      if (opts.idempotent) {
        const idem = await withIdempotency(ctx.orgId, req, () => fn({ req, ctx, params }));
        if (idem) {
          const res = NextResponse.json({ data: idem.body ?? null }, { status: idem.status });
          if (idem.replayed) res.headers.set('idempotent-replayed', 'true');
          return withIds(res, ids);
        }
      }
      const result = await fn({ req, ctx, params });
      if (result instanceof Response) return withIds(result, ids);
      return withIds(NextResponse.json({ data: result ?? null }), ids);
    } catch (e) {
      return withIds(errorResponse(e, ids), ids);
    }
  };
}

/** Rota pública (landing, simulador, chat, webhooks) — sempre com rate limit. */
export function publicRoute<P extends RouteParams = RouteParams>(opts: { rate: number; key: string }, fn: (args: { req: NextRequest; params: P; meta: ReturnType<typeof meta> }) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const ids = traceIds(req);
    try {
      const m = meta(req);
      await rateLimit(`pub:${opts.key}:${m.ip ?? 'na'}`, opts.rate, 60);
      const result = await fn({ req, params: await context.params, meta: m });
      if (result instanceof Response) return withIds(result, ids);
      return withIds(NextResponse.json({ data: result ?? null }), ids);
    } catch (e) {
      return withIds(errorResponse(e, ids), ids);
    }
  };
}

export async function body<T = unknown>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(400, 'BAD_JSON', 'JSON inválido.');
  }
}

export const query = (req: NextRequest) => Object.fromEntries(req.nextUrl.searchParams.entries());
