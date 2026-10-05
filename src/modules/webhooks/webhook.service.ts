import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { BadRequest } from '@/lib/errors';
import { enqueue } from '@/lib/queue';
import { EVENT_NAMES, type DomainEventEnvelope } from '@/lib/events';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';

// Webhooks de saída: WebhookSubscription → WebhookDelivery (POST JSON assinado, retry com backoff).

export const MAX_ATTEMPTS = 6;
export const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000; // 2, 4, 8, 16, 32, 60 min

export const subscriptionInput = z.object({
  name: z.string().min(3).max(120),
  url: z.string().url(),
  events: z.array(z.enum(EVENT_NAMES)).min(1),
  active: z.boolean().default(true),
});

function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) throw BadRequest('Somente URLs http(s).');
  if (isProduction) {
    if (url.protocol !== 'https:') throw BadRequest('Em produção, use HTTPS.');
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1)/.test(url.hostname)) throw BadRequest('Endereço interno não permitido.');
  }
}

export async function createSubscription(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'webhook.manage');
  const input = subscriptionInput.parse(raw);
  assertSafeUrl(input.url);
  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const sub = await db.webhookSubscription.create({ data: { organizationId: ctx.orgId, ...input, secret } });
  await audit(ctx, 'webhook.changed', { type: 'WebhookSubscription', id: sub.id }, { action: 'created', url: input.url, events: input.events });
  return sub;
}

export async function listSubscriptions(ctx: Ctx) {
  assertCan(ctx, 'webhook.manage');
  return db.webhookSubscription.findMany({
    where: { organizationId: ctx.orgId },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 10 } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function toggleSubscription(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, 'webhook.manage');
  await db.webhookSubscription.updateMany({ where: { id, organizationId: ctx.orgId }, data: { active } });
  await audit(ctx, 'webhook.changed', { type: 'WebhookSubscription', id }, { active });
}

/** Chamado pelo Event Bus para cada evento. */
export async function fanOutEvent(event: DomainEventEnvelope) {
  const subs = await db.webhookSubscription.findMany({ where: { organizationId: event.orgId, active: true, events: { has: event.name } } });
  for (const sub of subs) {
    const delivery = await db.webhookDelivery.create({
      data: {
        organizationId: event.orgId,
        subscriptionId: sub.id,
        event: event.name,
        payload: { id: event.id, event: event.name, occurredAt: event.occurredAt.toISOString(), data: event.payload } as object,
      },
    });
    await enqueue('webhook.deliver', { deliveryId: delivery.id });
  }
}

export function sign(secret: string, body: string, timestamp: string) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export async function deliverWebhook(deliveryId: string) {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true } });
  if (!d || d.status === 'SUCCESS' || !d.subscription.active) return;
  const body = JSON.stringify(d.payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const startedAt = Date.now();
  let status: number | null = null;
  let responseBody = '';
  try {
    const res = await fetch(d.subscription.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `${env.APP_NAME} Webhooks/1.0`,
        'x-prospect-event': d.event,
        'x-prospect-delivery': d.id,
        'x-prospect-timestamp': ts,
        'x-prospect-signature': `sha256=${sign(d.subscription.secret, body, ts)}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    status = res.status;
    responseBody = (await res.text()).slice(0, 1000);
  } catch (e) {
    responseBody = String(e).slice(0, 1000);
  }
  const ok = status != null && status >= 200 && status < 300;
  const attempts = d.attempts + 1;
  await db.webhookAttempt.create({ data: { organizationId: d.organizationId, deliveryId: d.id, attempt: attempts, responseStatus: status, error: ok ? null : responseBody.slice(0, 300), durationMs: Date.now() - startedAt } });
  const giveUp = !ok && attempts >= MAX_ATTEMPTS;
  await db.webhookDelivery.update({
    where: { id: d.id },
    data: {
      attempts,
      responseStatus: status,
      responseBody,
      status: ok ? 'SUCCESS' : giveUp ? 'FAILED' : 'RETRYING',
      nextAttemptAt: ok || giveUp ? null : new Date(Date.now() + backoffMs(attempts)),
    },
  });
  if (!ok && !giveUp && env.QUEUE_DRIVER === 'bullmq') await enqueue('webhook.deliver', { deliveryId: d.id }, { delayMs: backoffMs(attempts) });
}

/** Modo inline: retentativas pendentes são processadas pelo scan periódico. */
export async function retryDueWebhooks() {
  const due = await db.webhookDelivery.findMany({ where: { status: 'RETRYING', nextAttemptAt: { lte: new Date() } }, take: 50 });
  for (const d of due) await deliverWebhook(d.id);
  return due.length;
}
