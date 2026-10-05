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
export function toast(message: string, kind: ToastKind = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, kind } }));
}
