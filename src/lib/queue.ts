import { Queue } from 'bullmq';
import { env } from './env';
import { getRedis } from './redis';
import { logger } from './logger';

// Fila de trabalhos assíncronos.
//  - inline: executa imediatamente no mesmo processo (dev/testes, sem Redis)
//  - bullmq: enfileira no Redis; o worker (npm run worker) processa com retry/backoff

export type JobName =
  | 'lead.process' // enriquecimento → score → roteamento
  | 'ai.respond' // Maestro responde mensagem recebida
  | 'webhook.deliver'
  | 'campaign.dispatch'
  | 'knowledge.index'
  | 'followup.scan'
  | 'whatsapp.reset_counters'
  | 'intelligence.refresh' // sub-scores + NBA de um lead
  | 'intelligence.batch' // decaimento / reativação / expiração de NBA
  | 'operations.scan' // saúde de oportunidades, SLA, playbooks, knowledge vencida
  | 'duplicates.scan'
  | 'insights.generate'
  | 'outbox.dispatch'
  | 'notifications.release' // libera notificações retidas pelo horário de silêncio
  | 'push.send';

export const QUEUE_NAME = 'prospect';

const g = globalThis as unknown as { __queue?: Queue | null };

function getQueue(): Queue | null {
  if (env.QUEUE_DRIVER !== 'bullmq') return null;
  if (g.__queue !== undefined) return g.__queue;
  const connection = getRedis();
  g.__queue = connection ? new Queue(QUEUE_NAME, { connection }) : null;
  return g.__queue;
}

export async function enqueue(name: JobName, data: Record<string, unknown>, opts: { delayMs?: number; jobId?: string } = {}) {
  const queue = getQueue();
  if (queue) {
    try {
      await queue.add(name, data, {
        delay: opts.delayMs,
        jobId: opts.jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        // Timeout lógico: o worker aborta jobs acima do limite (ver src/worker.ts).
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return { mode: 'queued' as const };
    } catch (e) {
      logger.warn('queue.enqueue_failed_fallback_inline', { job: name, error: String(e) });
    }
  }
  const { runJob } = await import('@/jobs/handlers');
  // Inline: jobs de lead não podem derrubar a requisição que os disparou.
  if (name === 'intelligence.refresh' || name === 'push.send') {
    try {
      await runJob(name, data);
    } catch (e) {
      logger.error('job.inline_failed', { job: name, error: String(e) });
    }
  } else {
    await runJob(name, data, { idempotencyKey: opts.jobId });
  }
  return { mode: 'inline' as const };
}
