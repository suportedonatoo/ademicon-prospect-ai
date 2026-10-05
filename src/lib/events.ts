import { db } from './db';
import { logger } from './logger';

// Event Bus abstrato. Hoje: in-process + persistência em DomainEvent.
// Futuro: publicar também em um broker (SNS/SQS, Kafka) sem mudar os publicadores.

export const EVENT_NAMES = [
  'lead.created',
  'lead.updated',
  'lead.merged',
  'lead.scored',
  'lead.qualified',
  'lead.assigned',
  'lead.unassigned',
  'lead.unattended',
  'lead.reactivated',
  'simulation.created',
  'conversation.created',
  'conversation.message_received',
  'conversation.message_sent',
  'conversation.handoff',
  'conversation.number_switched',
  'opportunity.created',
  'opportunity.stage_changed',
  'opportunity.closed',
  'opportunity.stalled',
  'campaign.started',
  'campaign.paused',
  'ai.execution_started',
  'ai.execution_completed',
  'ai.handoff',
  'ai.knowledge_gap',
  'consent.created',
  'consent.revoked',
  'task.overdue',
  'integration.error',
  'sla.breached',
  'recovery.detected',
  'playbook.executed',
  'followup.created',
  'notification.created',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  id: string;
  orgId: string;
  name: EventName;
  payload: T;
  occurredAt: Date;
}

type Handler = (event: DomainEventEnvelope) => Promise<void> | void;

const g = globalThis as unknown as { __eventHandlers?: Map<string, Handler[]>; __subscribersLoaded?: Promise<void> };
const handlers = (g.__eventHandlers ??= new Map());

export function subscribe(name: EventName | '*', handler: Handler) {
  const list = handlers.get(name) ?? [];
  list.push(handler);
  handlers.set(name, list);
}

async function ensureSubscribers() {
  // Carregamento tardio evita dependências circulares entre módulos.
  g.__subscribersLoaded ??= import('@/modules/subscribers').then((m) => m.registerSubscribers());
  await g.__subscribersLoaded;
}

export async function publish<T extends Record<string, unknown>>(orgId: string, name: EventName, payload: T): Promise<void> {
  await ensureSubscribers();
  const record = await db.domainEvent.create({ data: { organizationId: orgId, name, payload: payload as object } });
  const envelope: DomainEventEnvelope = { id: record.id, orgId, name, payload, occurredAt: record.createdAt };
  const list = [...(handlers.get(name) ?? []), ...(handlers.get('*') ?? [])];
  for (const h of list) {
    try {
      await h(envelope);
    } catch (e) {
      logger.error('event.handler_failed', { event: name, error: String(e) });
    }
  }
}
