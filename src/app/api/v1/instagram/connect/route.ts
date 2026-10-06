import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { Forbidden } from '@/lib/errors';
import { instagramAuthorizeUrl } from '@/modules/instagram/instagram.service';

/** GET /api/v1/instagram/connect — o consultor logado vai para a tela de autorização do Instagram. */
export async function GET(req: NextRequest) {
  const ctx = await resolveCtx(req);
  if (!ctx) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent('/perfil')}`);
  try {
    if (!ctx.consultantId) throw Forbidden('Só um consultor conecta o próprio Instagram. Entre com o login de consultor.');
    return NextResponse.redirect(instagramAuthorizeUrl(ctx.consultantId));
  } catch (e) {
    return errorResponse(e);
  }
}
