import { NextResponse, type NextRequest } from 'next/server';
import { resolveCtx } from '@/lib/api';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { completeInstagramConnect } from '@/modules/instagram/instagram.service';
import { IG_RETURN_COOKIE, IG_RETURN_PAGES } from '@/modules/instagram/connect-return';

/** GET /api/v1/instagram/callback — volta da autorização do Instagram; grava a conta no consultor e retorna ao perfil. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  // Volta para a tela de onde o consultor clicou em Entrar com o Instagram (Meu perfil, Vídeos ou Configurar IA).
  const page = IG_RETURN_PAGES.find((x) => x === req.cookies.get(IG_RETURN_COOKIE)?.value) ?? '/perfil';
  const back = (q: Record<string, string>) => {
    const res = NextResponse.redirect(`${env.APP_URL}${page}?${new URLSearchParams(q)}`);
    res.cookies.delete({ name: IG_RETURN_COOKIE, path: '/api/v1/instagram' });
    return res;
  };
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
