'use client';

// Cliente HTTP da UI → API /api/v1 (a interface consome a mesma API pública documentada).
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.form ? undefined : { 'content-type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = json?.error?.details;
    const fieldErrors = details?.fieldErrors ? Object.entries(details.fieldErrors as Record<string, string[]>).map(([k, v]) => `${k}: ${v.join(', ')}`) : [];
    throw new ApiError(res.status, [json?.error?.message ?? `Erro ${res.status}`, ...fieldErrors].join(' · '), details);
  }
  return json.data as T;
}

// Toasts globais simples (evento de janela).
export type ToastKind = 'success' | 'error' | 'info';
export interface TempCredential {
  name: string;
  email: string;
  password: string;
  at: number;
}
export const TEMP_CREDENTIALS_KEY = 'pa_temp_credentials';
export const TEMP_CREDENTIALS_TTL_MS = 5 * 60_000;

/**
 * Senha provisória recém-criada: fica visível por 5 minutos num painel fixo (com copiar),
 * mesmo que o modal feche ou a página recarregue. Guardada só na aba (sessionStorage) e apagada ao vencer.
 */
export function showTempPassword(c: Omit<TempCredential, 'at'>) {
  try {
    const list = (JSON.parse(sessionStorage.getItem(TEMP_CREDENTIALS_KEY) ?? '[]') as TempCredential[]).filter((x) => x.email !== c.email);
    sessionStorage.setItem(TEMP_CREDENTIALS_KEY, JSON.stringify([...list, { ...c, at: Date.now() }]));
  } catch {
    /* sem sessionStorage: o modal continua mostrando a senha */
  }
  window.dispatchEvent(new Event('app:temp-credentials'));
}

export function toast(message: string, kind: ToastKind = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, kind } }));
}
