import { getRedis } from './redis';
import { TooManyRequests } from './errors';

// Janela fixa por chave. Usa Redis quando disponível; senão memória local do processo.
const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const redis = getRedis();
  if (redis && redis.status === 'ready') {
    try {
      const k = `rl:${key}`;
      const count = await redis.incr(k);
      if (count === 1) await redis.expire(k, windowSec);
      if (count > limit) throw TooManyRequests();
      return;
    } catch (e) {
      if ((e as { code?: string }).code === 'RATE_LIMITED') throw e;
      // Redis indisponível: segue para memória
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return;
  }
  entry.count++;
  if (entry.count > limit) throw TooManyRequests();
}
