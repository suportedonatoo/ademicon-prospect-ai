import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api';
import { env } from '@/lib/env';
import { BadRequest } from '@/lib/errors';
import { receiveInstagram, verifyInstagramSignature } from '@/modules/instagram/instagram.service';
import { receiveInstagramComments } from '@/modules/instagram/comment-dm.service';

/** GET — verificação do webhook (hub.challenge) com o token de verificação da Meta. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && env.META_VERIFY_TOKEN && p.get('hub.verify_token') === env.META_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

/**
 * POST /api/v1/webhooks/instagram?org=<slug> — assinado com o App Secret.
 * Mensagens do Direct (entry[].messaging) e comentários nos posts (entry[].changes, campo "comments").
 */
export const POST = publicRoute({ rate: 600, key: 'ig-webhook' }, async ({ req }) => {
  const raw = await req.text();
  verifyInstagramSignature(raw, req.headers.get('x-hub-signature-256'));
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw BadRequest('JSON inválido.');
  }
  const org = req.nextUrl.searchParams.get('org');
  const messages = await receiveInstagram(org, payload as never);
  const comments = await receiveInstagramComments(org, payload as never);
  return { ...messages, comments: comments.comments, commentResults: comments.results };
});
