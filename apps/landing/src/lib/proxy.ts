import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { GestaoError } from './gestao';
import { allowQueryFallback, CENTRAL_SITE, isValidSubdomain, subdomainFromHost } from './site';

// Utilitários das rotas /api/* do serviço de landing (o navegador fala só com este serviço).

const hits = new Map<string, { n: number; reset: number }>();

/** Limite por IP (janela fixa, memória do processo). Com várias instâncias, trocar por Redis. */
export function rateLimited(key: string, limit: number, windowSec = 60) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowSec * 1000 });
    if (hits.size > 50_000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > limit;
}

/**
 * IP do visitante: valor do X-Forwarded-For acrescentado pelo proxy confiável (TRUSTED_PROXY_HOPS,
 * contado da direita). Valores à esquerda podem ser forjados e não servem para limite por IP.
 */
export function visitor(req: NextRequest) {
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 0);
  const xff = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = hops > 0 && xff.length ? xff[Math.max(0, xff.length - hops)] : req.headers.get('x-real-ip') || null;
  return { ip, userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null };
}

/**
 * Site da requisição: sempre pelo endereço acessado (subdomínio da PJ); endereço principal = landing central.
 * Em desenvolvimento aceita o "site" enviado pela página.
 */
export function siteOf(req: NextRequest, fallback?: unknown) {
  const fromHost = subdomainFromHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  if (fromHost) return fromHost;
  // Link por caminho (<site>/c/<link>): o site vem da página de onde a chamada partiu (mesma origem), não do corpo.
  const fromPath = sitePathOf(req.headers.get('referer'));
  if (fromPath) return fromPath;
  if (allowQueryFallback() && typeof fallback === 'string' && isValidSubdomain(fallback)) return fallback;
  return CENTRAL_SITE;
}

/** /c/<link> no endereço da página → <link>. */
export function sitePathOf(referer: string | null) {
  if (!referer) return null;
  try {
    const m = new URL(referer).pathname.match(/^\/c\/([a-z0-9-]+)\/?$/);
    return m && isValidSubdomain(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
}

/** Só aceita chamadas da própria página (mesma origem). */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  return !origin || !host || new URL(origin).host === host;
}

export function fail(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

export function fromError(e: unknown) {
  if (e instanceof GestaoError) return fail(e.message, e.status >= 500 ? 502 : e.status);
  if (e instanceof SyntaxError) return fail('Requisição inválida.', 400);
  return fail('Erro inesperado. Tente novamente.', 500);
}
