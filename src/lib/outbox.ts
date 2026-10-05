import type { Prisma } from '@prisma/client';
import { db, type Tx } from './db';
import { publish, type EventName } from './events';
import { logger } from './logger';

// OUTBOX PATTERN — para eventos que NÃO podem se perder:
//   transação de negócio grava OutboxEvent → worker despacha para o Event Bus → marca DISPATCHED.
// Falhas são reprocessadas com backoff exponencial; após 8 tentativas ficam FAILED (visível na Saúde).

export async function enqueueOutbox(tx: Tx | Prisma.TransactionClient, orgId: string, name: EventName, payload: Record<string, unknown>) {
  // Horário definido pela aplicação (o mesmo relógio usado para decidir quando despachar).
  await tx.outboxEvent.create({ data: { organizationId: orgId, name, payload: payload as object, availableAt: new Date() } });
}

export async function dispatchOutbox(limit = 200) {
  const due = await db.outboxEvent.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: limit });
  let dispatched = 0;
  for (const ev of due) {
    // Reserva otimista: só um processador despacha cada evento.
    const claimed = await db.outboxEvent.updateMany({ where: { id: ev.id, status: 'PENDING', attempts: ev.attempts }, data: { attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      await publish(ev.organizationId, ev.name as EventName, ev.payload as Record<string, unknown>);
      await db.outboxEvent.update({ where: { id: ev.id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } });
      dispatched++;
    } catch (e) {
      const attempts = ev.attempts + 1;
      await db.outboxEvent.update({ where: { id: ev.id }, data: { status: attempts >= 8 ? 'FAILED' : 'PENDING', lastError: String(e).slice(0, 500), availableAt: new Date(Date.now() + 2 ** attempts * 1000) } });
      logger.error('outbox.dispatch_failed', { id: ev.id, name: ev.name, attempts, error: String(e) });
    }
  }
  return { dispatched, pending: due.length - dispatched };
}
