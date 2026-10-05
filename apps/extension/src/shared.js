// Funções compartilhadas entre o popup e o service worker da extensão.
// O token fica em chrome.storage.local (isolado por extensão) e só é enviado à plataforma configurada.

export async function getConfig() {
  const { apiUrl = '', token = '' } = await chrome.storage.local.get(['apiUrl', 'token']);
  return { apiUrl: apiUrl.replace(/\/$/, ''), token };
}

export async function fetchSummary() {
  const { apiUrl, token } = await getConfig();
  if (!apiUrl || !token) return { error: 'NOT_CONNECTED' };
  try {
    const res = await fetch(`${apiUrl}/api/v1/extension/summary`, { headers: { Authorization: `Device ${token}` }, credentials: 'omit', cache: 'no-store' });
    if (res.status === 401) return { error: 'REVOKED' };
    if (!res.ok) return { error: `HTTP_${res.status}` };
    const json = await res.json();
    return { data: json.data };
  } catch {
    return { error: 'OFFLINE' };
  }
}

/** Abre sempre dentro da plataforma configurada (nunca uma URL arbitrária). */
export function openInPlatform(apiUrl, path) {
  const base = new URL(apiUrl);
  const url = new URL(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/', base);
  if (url.origin !== base.origin) return;
  chrome.tabs.create({ url: url.href });
}
