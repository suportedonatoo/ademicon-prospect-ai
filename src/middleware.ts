import { NextResponse, type NextRequest } from 'next/server';

// Identificador anônimo de visitante das landings (sem dado pessoal): mantém a MESMA variante de
// experimento A/B entre visitas. Só em /landing/*.
export function middleware(req: NextRequest) {
  const existing = req.cookies.get('pa_vid')?.value;
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return NextResponse.next();
  const vid = crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set('x-pa-vid', vid);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('pa_vid', vid, { httpOnly: true, sameSite: 'lax', path: '/landing', maxAge: 60 * 60 * 24 * 90, secure: process.env.NODE_ENV === 'production' });
  return res;
}

export const config = { matcher: ['/landing/:path*'] };
