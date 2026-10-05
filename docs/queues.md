# Filas e jobs

`enqueue(job, data, { delayMs, jobId })` (`src/lib/queue.ts`):
- `QUEUE_DRIVER=bullmq` → Redis + worker (`npm run worker`): **retry 5x com backoff exponencial**, `jobId` como chave de **idempotência**, **timeout** por job (`JOB_TIMEOUT_MS`, padrão 120 s) e **dead-letter** (`JobRun` status `DEAD` quando as tentativas se esgotam).
- `QUEUE_DRIVER=inline` → executa no processo (dev/testes). Os jobs recorrentes são agendados em memória por `src/instrumentation-node.ts` (exceto em `APP_ENV=test`).

Jobs de manutenção registram `JobRun` (status, tentativas, duração, erro) — visível na Saúde da Operação.

| Job | Agenda (worker) | O que faz |
|---|---|---|
| `lead.process` | por lead | enriquecimento → score → roteamento → IA |
| `ai.respond` | por mensagem | Maestro responde |
| `intelligence.refresh` | por evento (dedupe por minuto) | sub-scores + ciclo de vida + NBA de um lead |
| `intelligence.batch` | 1 h | decaimento/reativação de todos os leads abertos; expira NBAs |
| `operations.scan` | 5 min | saúde das oportunidades, SLA, playbooks com espera vencida, knowledge vencida |
| `followup.scan` | 15 min | follow-up engine + retentativa de webhooks |
| `duplicates.scan` | 6 h | candidatos a duplicidade |
| `insights.generate` | diário 06:00 | AI Insights |
| `outbox.dispatch` | 30 s | despacha eventos do outbox |
| `notifications.release` | 1 min | libera notificações retidas pelo silêncio |
| `push.send` | por notificação | Web Push para os dispositivos do usuário |
| `webhook.deliver` | por entrega | webhook de saída (tentativas registradas em `WebhookAttempt`) |
| `knowledge.index` | por documento | chunking + embeddings |
| `campaign.dispatch` | por disparo | campanha de WhatsApp (opt-in, limites) |
| `whatsapp.reset_counters` | diário 00:00 | zera contadores diários dos números |

## Idempotência de entrada

Webhooks recebidos têm `idempotencyKey = provider:org:idExterno` (único). O mesmo evento duas vezes vira `DUPLICATE` e não cria lead, mensagem ou resposta; o Maestro também ignora mensagem com `externalId` já registrado.
