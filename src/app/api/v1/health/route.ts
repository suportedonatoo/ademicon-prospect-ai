import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/** GET /api/v1/health — liveness/readiness (banco e, se configurado, Redis). Sem dados sensíveis. */
export async function GET() {
  const checks: Record<string, 'ok' | 'down' | 'disabled'> = {};
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'down';
  }
  const redis = getRedis();
  if (!redis) checks.redis = 'disabled';
  else {
    try {
      checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      checks.redis = 'down';
    }
  }
  // Redis só é obrigatório com filas reais; no modo inline o sistema opera com fallback em memória.
  const ok = checks.database === 'ok' && !(process.env.QUEUE_DRIVER === 'bullmq' && checks.redis === 'down');
  return NextResponse.json({ status: ok ? 'ok' : 'degraded', checks, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
