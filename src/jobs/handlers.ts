import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { JobName } from '@/lib/queue';

// Handlers dos jobs assíncronos (usados pelo worker BullMQ e pelo modo inline).
// Jobs de manutenção registram JobRun (monitoramento, idempotência por chave e dead-letter).

/** Jobs de alta frequência por lead não geram JobRun (evita volume sem valor de diagnóstico). */
const UNTRACKED: JobName[] = ['intelligence.refresh', 'ai.respond', 'lead.process', 'webhook.deliver'];

async function forEachOrg<T>(fn: (orgId: string) => Promise<T>) {
  const orgs = await db.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  const out: Record<string, T> = {};
  for (const o of orgs) {
    try {
      out[o.id] = await fn(o.id);
    } catch (e) {
      logger.error('job.org_failed', { orgId: o.id, error: String(e) });
    }
  }
  return out;
}

async function execute(name: JobName, data: Record<string, unknown>) {
  switch (name) {
    case 'lead.process': {
      const { processLead } = await import('@/modules/leads/lead-engine');
      return processLead(String(data.orgId), String(data.leadId));
    }
    case 'ai.respond': {
      const { receiveInboundMessage } = await import('@/modules/ai/maestro/maestro.engine');
      return receiveInboundMessage(String(data.orgId), String(data.conversationId), String(data.text), data.externalId as string | undefined);
    }
    case 'webhook.deliver': {
      const { deliverWebhook } = await import('@/modules/webhooks/webhook.service');
      return deliverWebhook(String(data.deliveryId));
    }
    case 'knowledge.index': {
      const { indexDocument } = await import('@/modules/knowledge-base/knowledge.service');
      return indexDocument(String(data.orgId), String(data.documentId));
    }
    case 'campaign.dispatch': {
      const { dispatchCampaignMessage } = await import('@/modules/campaigns/campaign-messaging');
      return dispatchCampaignMessage(String(data.orgId), String(data.messageId));
    }
    case 'followup.scan': {
      const { scanFollowUps } = await import('@/modules/automations/followup.engine');
      const { retryDueWebhooks } = await import('@/modules/webhooks/webhook.service');
      const res = await forEachOrg(scanFollowUps);
      await retryDueWebhooks();
      return res;
    }
    case 'whatsapp.reset_counters':
      return db.whatsAppNumber.updateMany({ data: { sentToday: 0 } });
    case 'intelligence.refresh': {
      const { refreshLeadIntelligence } = await import('@/modules/lead-intelligence/intelligence-v2.service');
      return refreshLeadIntelligence(String(data.orgId), String(data.leadId));
    }
    case 'intelligence.batch': {
      // Decaimento temporal, reativação e expiração de NBAs.
      const { refreshIntelligenceBatch } = await import('@/modules/lead-intelligence/intelligence-v2.service');
      return forEachOrg((orgId) => refreshIntelligenceBatch(orgId));
    }
    case 'operations.scan': {
      // Saúde de oportunidades, SLA, playbooks, duplicidades, insights, knowledge vencida.
      const { scanOpportunityHealth } = await import('@/modules/opportunities/opportunity-intelligence.service');
      const { scanSla } = await import('@/modules/sla/sla.service');
      const { tickPlaybooks } = await import('@/modules/playbooks/playbook.service');
      const { expireKnowledge } = await import('@/modules/knowledge-base/knowledge.service');
      const { purgeIdempotency } = await import('@/lib/idempotency');
      const { purgeExpiredMemory } = await import('@/modules/ai/memory/memory.service');
      const { scanNumbers } = await import('@/modules/whatsapp/number-pool');
      await purgeIdempotency(); // chaves de idempotência com mais de 24 h
      return forEachOrg(async (orgId) => ({
        health: await scanOpportunityHealth(orgId),
        sla: await scanSla(orgId),
        playbooks: await tickPlaybooks(orgId),
        knowledge: await expireKnowledge(orgId),
        memoryPurged: await purgeExpiredMemory(orgId),
        whatsappFailover: await scanNumbers(orgId), // números fora do ar com conversas abertas → backup
      }));
    }
    case 'duplicates.scan': {
      const { scanDuplicates } = await import('@/modules/leads/duplicates.service');
      return forEachOrg((orgId) => scanDuplicates(orgId));
    }
    case 'insights.generate': {
      const { generateInsights } = await import('@/modules/insights/insights.service');
      return forEachOrg((orgId) => generateInsights(orgId));
    }
    case 'outbox.dispatch': {
      const { dispatchOutbox } = await import('@/lib/outbox');
      return dispatchOutbox();
    }
    case 'notifications.release': {
      const { releaseHeldNotifications } = await import('@/modules/notifications/notification.service');
      return releaseHeldNotifications();
    }
    case 'push.send': {
      const { deliverPush } = await import('@/modules/notifications/push.service');
      return deliverPush(String(data.notificationId));
    }
  }
}

export async function runJob(name: JobName, data: Record<string, unknown>, meta: { idempotencyKey?: string; attempt?: number } = {}) {
  const started = Date.now();
  const tracked = !UNTRACKED.includes(name);
  let runId: string | null = null;
  if (tracked) {
    if (meta.idempotencyKey) {
      const done = await db.jobRun.findUnique({ where: { idempotencyKey: meta.idempotencyKey } });
      if (done?.status === 'COMPLETED') return { skipped: true, reason: 'idempotent' };
    }
    const run = meta.idempotencyKey
      ? await db.jobRun.upsert({ where: { idempotencyKey: meta.idempotencyKey }, create: { job: name, idempotencyKey: meta.idempotencyKey, organizationId: (data.orgId as string) ?? null, attempts: meta.attempt ?? 1 }, update: { status: 'RUNNING', attempts: meta.attempt ?? 1, startedAt: new Date() } })
      : await db.jobRun.create({ data: { job: name, organizationId: (data.orgId as string) ?? null, attempts: meta.attempt ?? 1 } });
    runId = run.id;
  }
  try {
    const result = await execute(name, data);
    if (runId) await db.jobRun.update({ where: { id: runId }, data: { status: 'COMPLETED', durationMs: Date.now() - started, finishedAt: new Date() } });
    return result;
  } catch (e) {
    if (runId) await db.jobRun.update({ where: { id: runId }, data: { status: 'FAILED', error: String(e).slice(0, 1000), durationMs: Date.now() - started, finishedAt: new Date() } }).catch(() => undefined);
    throw e;
  } finally {
    logger.debug('job.done', { name, ms: Date.now() - started });
  }
}

/** Dead-letter: chamado pelo worker quando as tentativas se esgotam. */
export async function markDead(name: string, data: Record<string, unknown>, error: string, attempts: number) {
  await db.jobRun.create({ data: { job: name, organizationId: (data.orgId as string) ?? null, status: 'DEAD', attempts, error: error.slice(0, 1000), finishedAt: new Date() } });
}
