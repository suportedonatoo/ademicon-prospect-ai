// Logger estruturado (JSON) com redação de campos sensíveis.
// Preparado para envio a um coletor (Datadog, Loki, OpenTelemetry) no futuro.
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|cpf|cnpj|phone|email/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1)])
    );
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta ? (redact(meta) as object) : {}) });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
