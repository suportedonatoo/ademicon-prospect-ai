import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, resolveCtx } from '@/lib/api';
import { openNotification } from '@/modules/notifications/notification.service';

/**
 * GET /api/v1/notifications/:id/open?via=desktop|push|extension|bell
 * Destino do clique em QUALQUER canal: marca como lida/clicada (métricas) e redireciona ao recurso.
 * Sem sessão → login e volta para cá (o recurso continua exigindo permissão).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await resolveCtx(req);
  const self = `/api/v1/notifications/${encodeURIComponent(id)}/open${req.nextUrl.search}`;
  if (!ctx) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self)}`, req.url));
  try {
    const { link } = await openNotification(ctx, id, req.nextUrl.searchParams.get('via') ?? 'bell');
    return NextResponse.redirect(new URL(link, req.url));
  } catch (e) {
    return errorResponse(e);
  }
}
