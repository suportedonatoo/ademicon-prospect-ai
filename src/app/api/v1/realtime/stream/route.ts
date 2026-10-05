import type { NextRequest } from 'next/server';
import { resolveCtx } from '@/lib/api';
import { subscribeRealtime, type RealtimeEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/v1/realtime/stream — Server-Sent Events do usuário logado (notificações, inbox, NBA).
 * Heartbeat a cada 25s; o navegador reconecta sozinho (EventSource). Sem polling agressivo.
 */
export async function GET(req: NextRequest) {
  const ctx = await resolveCtx(req);
  if (!ctx || !ctx.userId) return new Response('unauthorized', { status: 401 });
  const userId = ctx.userId;
  const encoder = new TextEncoder();
  let cleanup: () => void = () => undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: RealtimeEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      controller.enqueue(encoder.encode(`retry: 5000\nevent: ready\ndata: {}\n\n`));
      const unsubscribe = subscribeRealtime(ctx.orgId, userId, send);
      const ping = setInterval(() => send({ type: 'ping', data: { t: Date.now() } }), 25_000);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}
