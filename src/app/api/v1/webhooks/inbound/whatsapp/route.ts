import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api';
import { env, isProduction } from '@/lib/env';
import { BadRequest } from '@/lib/errors';
import { receiveWebhook } from '@/modules/whatsapp/whatsapp.service';
import { assertWebhookAuthentic } from '@/modules/whatsapp/webhook-auth';

/** GET — verificação de assinatura do webhook (padrão hub.challenge da plataforma oficial). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && p.get('hub.verify_token') === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

/** POST /api/v1/webhooks/inbound/whatsapp?org=demo — mensagem recebida (assinada). Mock aceita { from, to?, text, profileName? }. */
export const POST = publicRoute({ rate: 600, key: 'wa-webhook' }, async ({ req }) => {
  const raw = await req.text();
  assertWebhookAuthentic({ rawBody: raw, signature: req.headers.get('x-hub-signature-256'), appSecret: env.WHATSAPP_APP_SECRET, provider: env.WHATSAPP_PROVIDER, production: isProduction });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw BadRequest('JSON inválido.');
  }
  const headers = Object.fromEntries(req.headers.entries());
  return receiveWebhook('whatsapp', req.nextUrl.searchParams.get('org'), payload, headers);
});
