import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { Forbidden } from '@/lib/errors';
import { googleAuthorizeUrl } from '@/modules/calendar/google-calendar.service';

/** GET /api/v1/google/calendar/connect — o consultor logado vai para a autorização do Google Agenda. */
export async function GET(req: NextRequest) {
  const ctx = await resolveCtx(req);
  if (!ctx) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent('/configurar-ia')}`);
  try {
    if (!ctx.consultantId) throw Forbidden('Só um consultor conecta a própria agenda. Entre com o login de consultor.');
    return NextResponse.redirect(googleAuthorizeUrl(ctx.consultantId));
  } catch (e) {
    return errorResponse(e);
  }
}
