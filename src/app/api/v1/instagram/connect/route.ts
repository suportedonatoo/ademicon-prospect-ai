import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { Forbidden } from '@/lib/errors';
import { instagramAuthorizeUrl } from '@/modules/instagram/instagram.service';
import { IG_RETURN_COOKIE, IG_RETURN_PAGES } from '@/modules/instagram/connect-return';

/** GET /api/v1/instagram/connect?next=/instagram-videos — o consultor logado vai para a autorização do Instagram. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next');
  const back = IG_RETURN_PAGES.find((p) => p === next) ?? '/perfil';
  const ctx = await resolveCtx(req);
  if (!ctx) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent(back)}`);
  try {
    if (!ctx.consultantId) throw Forbidden('Só um consultor conecta o próprio Instagram. Entre com o login de consultor.');
    const res = NextResponse.redirect(instagramAuthorizeUrl(ctx.consultantId));
    // Lembra para onde voltar (15 min, só este site).
    res.cookies.set(IG_RETURN_COOKIE, back, { httpOnly: true, sameSite: 'lax', path: '/api/v1/instagram', maxAge: 900, secure: env.APP_URL.startsWith('https') });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
