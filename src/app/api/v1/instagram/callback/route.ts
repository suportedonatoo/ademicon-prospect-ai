import { NextResponse, type NextRequest } from 'next/server';
import { resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { completeInstagramConnect } from '@/modules/instagram/instagram.service';

/** GET /api/v1/instagram/callback — volta da autorização do Instagram; grava a conta no consultor e retorna ao perfil. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${env.APP_URL}/perfil?${new URLSearchParams(q)}`);
  const ctx = await resolveCtx(req);
  if (!ctx) return NextResponse.redirect(`${env.APP_URL}/login?next=${encodeURIComponent('/perfil')}`);
  const code = p.get('code');
  if (!code) return back({ instagram: 'erro', motivo: p.get('error_description') ?? 'Autorização cancelada.' });
  try {
    const { username } = await completeInstagramConnect(ctx, code, p.get('state'));
    return back({ instagram: 'ok', conta: username ?? '' });
  } catch (e) {
    logger.warn('instagram.connect_failed', { consultantId: ctx.consultantId, error: String((e as Error).message ?? e) });
    return back({ instagram: 'erro', motivo: (e as Error).message ?? 'Não foi possível conectar.' });
  }
}
