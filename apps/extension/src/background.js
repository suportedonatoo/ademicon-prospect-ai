import { fetchSummary, getConfig, openInPlatform } from './shared.js';

// Consulta a plataforma a cada minuto (alarme do navegador — o MV3 não mantém conexões abertas),
// atualiza o contador do ícone e mostra notificação nativa do que chegou desde a última consulta.

const ensureAlarm = () => chrome.alarms.create('poll', { periodInMinutes: 1 });
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((a) => a.name === 'poll' && poll());
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'poll') poll();
});

async function poll() {
  const r = await fetchSummary();
  if (r.error) {
    await chrome.action.setBadgeText({ text: r.error === 'NOT_CONNECTED' ? '' : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#c2352b' });
    return;
  }
  const d = r.data;
  await chrome.action.setBadgeText({ text: d.unread ? String(Math.min(d.unread, 99)) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#eb6834' });
  const { seen = [] } = await chrome.storage.local.get('seen');
  const seenSet = new Set(seen);
  const fresh = d.notifications.filter((n) => !n.readAt && !seenSet.has(n.id));
  for (const n of fresh.slice(0, 3)) {
    chrome.notifications.create(`n:${n.id}`, { type: 'basic', iconUrl: 'icon-128.png', title: n.title, message: n.body || 'Abrir na plataforma', priority: n.priority === 'CRITICAL' ? 2 : n.priority === 'HIGH' ? 1 : 0 });
    await chrome.storage.local.set({ [`open:${n.id}`]: n.open });
  }
  await chrome.storage.local.set({ seen: [...seenSet, ...fresh.map((n) => n.id)].slice(-300), lastSync: Date.now() });
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('n:')) return;
  const key = `open:${id.slice(2)}`;
  const stored = await chrome.storage.local.get(key);
  const { apiUrl } = await getConfig();
  if (apiUrl && stored[key]) openInPlatform(apiUrl, stored[key]);
  chrome.notifications.clear(id);
});
