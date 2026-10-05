import IORedis from 'ioredis';
import { env } from './env';

// Conexão Redis compartilhada (opcional). Sem REDIS_URL o sistema cai para modos em memória.
const g = globalThis as unknown as { redis?: IORedis | null };

export function getRedis(): IORedis | null {
  if (g.redis !== undefined) return g.redis;
  if (!env.REDIS_URL) return (g.redis = null);
  g.redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false, enableOfflineQueue: false });
  g.redis.on('error', () => {
    /* erros de conexão são tratados pelos chamadores (fallback em memória) */
  });
  return g.redis;
}

/** Fecha a conexão compartilhada (scripts como o seed; sem isso o processo não encerra). */
export async function closeRedis() {
  const redis = g.redis;
  g.redis = undefined;
  if (redis) await redis.quit().catch(() => redis.disconnect());
}
