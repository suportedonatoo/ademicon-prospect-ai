import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api';
import { env } from '@/lib/env';
import { BadRequest } from '@/lib/errors';
import { receiveMetaLeads, verifyMetaSignature } from '@/modules/integrations/ads-leads.service';

/** GET — verificação do webhook (hub.challenge) com o token definido no painel. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && env.META_VERIFY_TOKEN && p.get('hub.verify_token') === env.META_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

/** POST /api/v1/webhooks/meta/leads?org=<slug> — evento "leadgen" do Lead Ads (assinado com o App Secret). */
export const POST = publicRoute({ rate: 600, key: 'meta-leads' }, async ({ req }) => {
  const raw = await req.text();
  verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'));
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw BadRequest('JSON inválido.');
  }
  return receiveMetaLeads(req.nextUrl.searchParams.get('org'), payload as never);
});
