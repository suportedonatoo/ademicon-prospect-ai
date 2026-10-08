import { NextResponse, type NextRequest } from 'next/server';
import { resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { completeGoogleConnect } from '@/modules/calendar/google-calendar.service';

/** GET /api/v1/google/calendar/callback — volta da autorização do Google; grava a agenda e retorna a Configurar IA. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${env.APP_URL}/configurar-ia?${new URLSearchParams(q)}#agenda`);
  const ctx = await resolveCtx(req);
  if (!ctx) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent('/configurar-ia')}`);
  const code = p.get('code');
  if (!code) return back({ google: 'erro', motivo: p.get('error') === 'access_denied' ? 'Autorização cancelada.' : (p.get('error') ?? 'Autorização cancelada.') });
  try {
    const { email } = await completeGoogleConnect(ctx, code, p.get('state'));
    return back({ google: 'ok', conta: email ?? '' });
  } catch (e) {
    logger.warn('google_calendar.connect_failed', { consultantId: ctx.consultantId, error: String((e as Error).message ?? e) });
    return back({ google: 'erro', motivo: (e as Error).message ?? 'Não foi possível conectar.' });
  }
}
