'use client';

// Chave da sessão de attribution (liga visita → simulação → lead). Guardada só neste navegador.
const KEY = 'pa_landing_session';

export function getSessionKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionKey(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* navegação privada / armazenamento bloqueado: segue sem persistir */
  }
}

export async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? 'Não foi possível concluir. Tente novamente.');
  return json.data as T;
}
