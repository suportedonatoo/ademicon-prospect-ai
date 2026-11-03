// No modo inline (sem worker BullMQ), agenda localmente os jobs recorrentes.
// Em produção (QUEUE_DRIVER=bullmq) quem agenda é o worker (src/worker.ts).
const g = globalThis as unknown as { __schedulers?: boolean };

if ((process.env.QUEUE_DRIVER ?? 'inline') === 'inline' && process.env.APP_ENV !== 'test' && !g.__schedulers) {
  g.__schedulers = true;
  const every = (name: Parameters<typeof import('./jobs/handlers').runJob>[0], ms: number, firstDelayMs = 20_000) => {
    const run = () => import('./jobs/handlers').then(({ runJob }) => runJob(name, {})).catch(() => undefined);
    setTimeout(run, firstDelayMs).unref();
    setInterval(run, ms).unref();
  };
  every('followup.scan', 15 * 60_000, 60_000);
  every('operations.scan', 5 * 60_000);
  every('notifications.release', 60_000);
  every('outbox.dispatch', 30_000);
  every('intelligence.batch', 60 * 60_000, 90_000);
  every('duplicates.scan', 6 * 60 * 60_000, 120_000);
  every('insights.generate', 6 * 60 * 60_000, 150_000);
  // Zera os contadores diários dos números de WhatsApp na virada do dia (horário de Brasília).
  // Sem isso, um número que bateu o limite ficaria bloqueado para sempre (o worker faz isso por cron).
  const spDay = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  let lastDay = spDay();
  setInterval(() => {
    const today = spDay();
    if (today === lastDay) return;
    lastDay = today;
    void import('./jobs/handlers').then(({ runJob }) => runJob('whatsapp.reset_counters', {})).catch(() => undefined);
  }, 5 * 60_000).unref();
}

// Chaves de API salvas no painel do Super Admin (prioridade sobre o .env). Recarrega a cada 2 min
// para outras instâncias pegarem mudanças feitas no painel.
const gc = globalThis as unknown as { __credentials?: boolean };
if (process.env.APP_ENV !== 'test' && !gc.__credentials) {
  gc.__credentials = true;
  const load = () =>
    import('./modules/platform/credentials.service')
      .then((m) => m.applyCredentials())
      .then(() => true)
      .catch(() => false);
  // Logo após subir, o banco pode recusar a conexão: insiste a cada 5 s até a primeira carga dar certo.
  // Sem isso, webhooks e IA ficariam até 2 minutos sem as chaves depois de cada reinício.
  const first = async () => {
    for (let i = 0; i < 60 && !(await load()); i++) await new Promise((r) => setTimeout(r, 5000));
  };
  void first();
  setInterval(load, 2 * 60_000).unref();
}

export {};
