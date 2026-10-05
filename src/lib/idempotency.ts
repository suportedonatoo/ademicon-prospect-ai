import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { db } from './db';
import { AppError } from './errors';

// Idempotency-Key (API 2.0): repetir a MESMA requisição com a mesma chave devolve a resposta
// original — sem criar dois leads, duas oportunidades ou enviar duas mensagens.
// Mesma chave com corpo diferente → 422. Requisição ainda em andamento → 409.
// Registros ficam por 24 h (limpeza em `purgeIdempotency`).

const KEY_FORMAT = /^[A-Za-z0-9_\-:.]{8,128}$/;
export const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotentResult {
  replayed: boolean;
  status: number;
  body: unknown;
}

export async function withIdempotency(orgId: string, req: NextRequest, run: () => Promise<unknown>): Promise<IdempotentResult | null> {
  const key = req.headers.get('idempotency-key');
  if (!key) return null; // cabeçalho opcional: sem ele, comportamento normal
  if (!KEY_FORMAT.test(key)) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key inválida (8 a 128 caracteres: letras, números, - _ : .).');
  const route = `${req.method} ${req.nextUrl.pathname}`;
  const raw = await req.clone().text();
  const requestHash = crypto.createHash('sha256').update(raw).digest('hex');

  let record;
  try {
    record = await db.idempotencyRecord.create({ data: { organizationId: orgId, key, route, requestHash } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    const existing = await db.idempotencyRecord.findUniqueOrThrow({ where: { organizationId_route_key: { organizationId: orgId, route, key } } });
    const expired = existing.createdAt.getTime() < Date.now() - IDEMPOTENCY_TTL_HOURS * 3600_000;
    if (expired) {
      await db.idempotencyRecord.delete({ where: { id: existing.id } });
      return withIdempotency(orgId, req, run);
    }
    if (existing.requestHash !== requestHash) throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key já foi usada com outro conteúdo.');
    if (existing.status !== 'COMPLETED') throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Uma requisição com esta Idempotency-Key ainda está em andamento.');
    return { replayed: true, status: existing.responseStatus ?? 200, body: existing.response };
  }

  try {
    const result = await run();
    await db.idempotencyRecord.update({ where: { id: record.id }, data: { status: 'COMPLETED', responseStatus: 200, response: (result ?? null) as Prisma.InputJsonValue } });
    return { replayed: false, status: 200, body: result };
  } catch (e) {
    // Falhou: libera a chave para nova tentativa (erros não são "memorizados").
    await db.idempotencyRecord.delete({ where: { id: record.id } }).catch(() => undefined);
    throw e;
  }
}

export async function purgeIdempotency() {
  return db.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3600_000) } } });
}
