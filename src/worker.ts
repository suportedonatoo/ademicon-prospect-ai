import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAME, type JobName } from './lib/queue';
import { markDead, runJob } from './jobs/handlers';
import { logger } from './lib/logger';

// Worker BullMQ: processa a fila "prospect" com retry/backoff e agenda jobs recorrentes.
// Uso: QUEUE_DRIVER=bullmq npm run worker

const url = process.env.REDIS_URL;
if (!url) {
  console.error('REDIS_URL não configurada — o worker precisa de Redis.');
  process.exit(1);
}
const connection = new IORedis(url, { maxRetriesPerRequest: null });

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    // Timeout por job: nenhuma tarefa fica presa indefinidamente.
    const timeoutMs = Number(process.env.JOB_TIMEOUT_MS ?? 120_000);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)));
    try {
      return await Promise.race([runJob(job.name as JobName, job.data, { idempotencyKey: job.id?.startsWith('repeat:') ? undefined : job.opts.jobId, attempt: job.attemptsMade + 1 }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5) }
);

worker.on('completed', (job) => logger.info('job.completed', { id: job.id, name: job.name }));
worker.on('failed', (job, err) => {
  logger.error('job.failed', { id: job?.id, name: job?.name, attempts: job?.attemptsMade, error: err.message });
  // Dead-letter: tentativas esgotadas → registro DEAD (visível em Saúde do sistema).
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) markDead(job.name, job.data, err.message, job.attemptsMade).catch(() => undefined);
});

async function scheduleRepeatables() {
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler('followup-scan', { every: 15 * 60_000 }, { name: 'followup.scan', data: {} });
  await queue.upsertJobScheduler('whatsapp-reset', { pattern: '0 0 * * *', tz: 'America/Sao_Paulo' }, { name: 'whatsapp.reset_counters', data: {} });
  await queue.upsertJobScheduler('operations-scan', { every: 5 * 60_000 }, { name: 'operations.scan', data: {} });
  await queue.upsertJobScheduler('intelligence-batch', { every: 60 * 60_000 }, { name: 'intelligence.batch', data: {} });
  await queue.upsertJobScheduler('duplicates-scan', { every: 6 * 60 * 60_000 }, { name: 'duplicates.scan', data: {} });
  await queue.upsertJobScheduler('insights-generate', { pattern: '0 6 * * *', tz: 'America/Sao_Paulo' }, { name: 'insights.generate', data: {} });
  await queue.upsertJobScheduler('outbox-dispatch', { every: 30_000 }, { name: 'outbox.dispatch', data: {} });
  await queue.upsertJobScheduler('notifications-release', { every: 60_000 }, { name: 'notifications.release', data: {} });
}

// Chaves de API do painel do Super Admin (prioridade sobre o .env), recarregadas a cada 2 min.
const loadCredentials = () => import('./modules/platform/credentials.service').then((m) => m.applyCredentials()).catch((e) => logger.error('worker.credentials_failed', { error: String(e) }));
void loadCredentials();
setInterval(loadCredentials, 2 * 60_000).unref();

scheduleRepeatables().then(() => logger.info('worker.started', { queue: QUEUE_NAME }));

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
