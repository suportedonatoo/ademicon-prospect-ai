import { EventEmitter } from 'node:events';
import type IORedis from 'ioredis';
import { getRedis } from './redis';
import { logger } from './logger';

// REAL-TIME HUB — entrega eventos para as conexões SSE abertas (/api/v1/realtime/stream).
// Uma instância: EventEmitter em memória. Várias instâncias: Redis Pub/Sub como barramento
// (cada instância assina o canal e repassa para as suas conexões). Sem polling agressivo.

export interface RealtimeEvent {
  type: 'notification' | 'conversation.message' | 'conversation.updated' | 'lead.updated' | 'nba.updated' | 'ping';
  data: Record<string, unknown>;
}

const CHANNEL = 'realtime:v1';
const g = globalThis as unknown as { __rt?: { emitter: EventEmitter; sub: IORedis | null; ready: boolean; connections: number } };

function hub() {
  if (g.__rt) return g.__rt;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(10_000);
  g.__rt = { emitter, sub: null, ready: false, connections: 0 };
  const redis = getRedis();
  if (redis) {
    try {
      const sub = redis.duplicate();
      sub.on('error', () => undefined);
      sub.subscribe(CHANNEL).catch(() => undefined);
      sub.on('message', (_ch, raw) => {
        try {
          const msg = JSON.parse(raw) as { key: string; event: RealtimeEvent };
          emitter.emit(msg.key, msg.event);
        } catch {
          /* mensagem inválida */
        }
      });
      g.__rt.sub = sub;
    } catch (e) {
      logger.warn('realtime.redis_unavailable', { error: String(e) });
    }
  }
  g.__rt.ready = true;
  return g.__rt;
}

const userKey = (userId: string) => `u:${userId}`;
const orgKey = (orgId: string) => `o:${orgId}`;

function emit(key: string, event: RealtimeEvent) {
  const h = hub();
  const redis = getRedis();
  if (h.sub && redis && redis.status === 'ready') {
    redis.publish(CHANNEL, JSON.stringify({ key, event })).catch(() => h.emitter.emit(key, event));
  } else {
    h.emitter.emit(key, event);
  }
}

export const emitToUser = (userId: string, event: RealtimeEvent) => emit(userKey(userId), event);
/** Eventos de organização (ex.: nova mensagem) — o cliente filtra pelo que pode ver; os dados trazem só IDs. */
export const emitToOrg = (orgId: string, event: RealtimeEvent) => emit(orgKey(orgId), event);

export function subscribeRealtime(orgId: string, userId: string, listener: (e: RealtimeEvent) => void) {
  const h = hub();
  h.emitter.on(userKey(userId), listener);
  h.emitter.on(orgKey(orgId), listener);
  h.connections++;
  return () => {
    h.emitter.off(userKey(userId), listener);
    h.emitter.off(orgKey(orgId), listener);
    h.connections--;
  };
}

/** Conexões SSE abertas nesta instância (Saúde do sistema). */
export const realtimeConnections = () => hub().connections;
export const realtimeTransport = () => (hub().sub ? 'redis' : 'memory');

/** Fecha a assinatura Redis do hub (scripts como o seed; sem isso o processo não encerra). */
export async function closeRealtime() {
  const sub = g.__rt?.sub;
  g.__rt = undefined;
  if (sub) await sub.quit().catch(() => sub.disconnect());
}
