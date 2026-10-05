import { fetchSummary, getConfig, openInPlatform } from './shared.js';

const $ = (id) => document.getElementById(id);

function node(tag, text) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text; // sempre textContent: nada de HTML vindo da API
  return n;
}

async function render() {
  const cfg = await getConfig();
  if (!cfg.apiUrl || !cfg.token) {
    $('connect').hidden = false;
    $('main').hidden = true;
    return;
  }
  $('connect').hidden = true;
  $('main').hidden = false;
  $('status').textContent = 'Atualizando…';
  const r = await fetchSummary();
  if (r.error) {
    $('status').className = 'error';
    $('status').textContent = r.error === 'REVOKED' ? 'Acesso revogado ou token inválido. Reconecte.' : r.error === 'OFFLINE' ? 'Sem conexão com a plataforma.' : `Erro: ${r.error}`;
    return;
  }
  const d = r.data;
  $('status').className = 'muted';
  $('status').textContent = `${d.user.name} · atualizado agora`;
  $('unread').textContent = d.unread ? String(d.unread) : '';
  list('notifications', d.notifications, (n) => [n.title, new Date(n.createdAt).toLocaleString('pt-BR')], (n) => n.open, (n) => !n.readAt);
  list('hot', d.hotLeads, (l) => [l.name, `score ${l.score}${l.product ? ' · ' + l.product : ''}`], (l) => l.open);
  list('awaiting', d.awaiting, (c) => [c.leadName, `desde ${new Date(c.since).toLocaleTimeString('pt-BR')}`], (c) => c.open);
  $('opps').textContent = `${d.opportunities.open} abertas · R$ ${d.opportunities.value.toLocaleString('pt-BR')} · ${d.opportunities.stalled} paradas · ${d.opportunities.atRisk} em risco`;
}

function list(id, items, text, path, unread = () => false) {
  const ul = $(id);
  ul.replaceChildren();
  if (!items.length) {
    const li = node('li');
    li.append(node('small', 'Nada por aqui.'));
    ul.append(li);
    return;
  }
  for (const it of items) {
    const [title, sub] = text(it);
    const btn = node('button');
    btn.append(node('b', title), node('small', sub));
    btn.addEventListener('click', async () => openInPlatform((await getConfig()).apiUrl, path(it)));
    const li = node('li');
    if (unread(it)) li.className = 'unread';
    li.append(btn);
    ul.append(li);
  }
}

$('save').addEventListener('click', async () => {
  $('connectError').textContent = '';
  let origin;
  try {
    origin = new URL($('apiUrl').value.trim()).origin;
  } catch {
    $('connectError').textContent = 'Endereço inválido.';
    return;
  }
  const token = $('token').value.trim();
  if (!token.startsWith('dx_')) {
    $('connectError').textContent = 'Token inválido (deve começar com dx_).';
    return;
  }
  // Permissão de rede apenas para o domínio da plataforma informada.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    $('connectError').textContent = 'É preciso permitir o acesso ao endereço da plataforma.';
    return;
  }
  await chrome.storage.local.set({ apiUrl: origin, token, seen: [] });
  chrome.runtime.sendMessage({ type: 'poll' });
  render();
});

$('refresh').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'poll' });
  render();
});
$('open').addEventListener('click', async () => openInPlatform((await getConfig()).apiUrl, '/'));
$('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'seen']);
  await chrome.action.setBadgeText({ text: '' });
  render();
});

render();
