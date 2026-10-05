import { NextResponse, type NextRequest } from 'next/server';
import { allowQueryFallback, CENTRAL_SITE, isValidSubdomain, subdomainFromHost } from './lib/site';

// Cada PJ tem seu endereço: <subdominio>.<LANDING_BASE_DOMAIN>. A página "/" é reescrita para /s/<subdominio>.
// O endereço principal (sem subdomínio) é a LANDING CENTRAL → /s/central. A lista de unidades fica em /unidades.
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  // /s/* é interno: não pode ser acessado direto (evita abrir a landing de outra PJ pelo endereço errado).
  if (pathname.startsWith('/s/')) return new NextResponse('Not found', { status: 404 });
  // Link do consultor/unidade por CAMINHO: <site>/c/<link> (usado quando não há subdomínio, ex.: netlify.app).
  const byPath = pathname.match(/^\/c\/([a-z0-9-]+)\/?$/);
  if (byPath) {
    if (!isValidSubdomain(byPath[1])) return new NextResponse('Not found', { status: 404 });
    const url = req.nextUrl.clone();
    url.pathname = `/s/${byPath[1]}`;
    return NextResponse.rewrite(url);
  }
  if (pathname !== '/') return NextResponse.next();
  const fromHost = subdomainFromHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  const fromQuery = allowQueryFallback() ? searchParams.get('pj') : null;
  const site = fromHost ?? (isValidSubdomain(fromQuery) ? fromQuery : CENTRAL_SITE);
  const url = req.nextUrl.clone();
  url.pathname = `/s/${site}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ['/', '/s/:path*', '/c/:path*'] };
