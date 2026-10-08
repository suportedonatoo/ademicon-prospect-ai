import type { NextRequest } from 'next/server';
import { readAutoDmImagePublic } from '@/modules/instagram/comment-dm.service';

/**
 * GET /api/v1/public/instagram-image/:consultantId?k=<chave>&s=<assinatura>
 * A Meta baixa daqui a foto enviada no Direct. Só abre com a assinatura gerada pelo sistema.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ consultantId: string }> }) {
  const { consultantId } = await context.params;
  const p = req.nextUrl.searchParams;
  try {
    const { data, mime } = await readAutoDmImagePublic(consultantId, p.get('k') ?? '', p.get('s') ?? '');
    return new Response(new Uint8Array(data), { headers: { 'content-type': mime, 'cache-control': 'public, max-age=3600' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
