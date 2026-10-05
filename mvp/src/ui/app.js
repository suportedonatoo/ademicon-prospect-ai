// Plataforma (CRM): login, layout com sidebar, roteamento por hash e permissões.
import { ensureSeeded, resetDemo } from '../services/db.js';
import { currentUser, login, logout, can, demoAccounts } from '../services/auth.js';
import { onDataChange } from '../services/storage.js';
import { notificationsFor, markAllRead } from '../services/notifications.js';
import { listLeads } from '../services/leads.js';
import { icon, avatar, toast, openModal } from './components/ui.js';
import { esc, timeAgo } from './format.js';

import * as dashboard from './views/dashboard.js';
import * as funil from './views/funil.js';
import * as leads from './views/leads.js';
import * as distribuicao from './views/distribuicao.js';
import * as equipe from './views/equipe.js';
import * as chatbot from './views/chatbot.js';
import * as whatsapp from './views/whatsapp.js';

ensureSeeded();

const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', group: 'Visão geral', view: dashboard },
  { id: 'funil', label: 'Funil (Kanban)', group: 'Comercial', view: funil },
  { id: 'leads', label: 'Leads', group: 'Comercial', view: leads },
  { id: 'distribuicao', label: 'Distribuição', group: 'Comercial', view: distribuicao },
  { id: 'equipe', label: 'Equipe PJ', group: 'Comercial', view: equipe },
  { id: 'chatbot', label: 'Chatbots', group: 'Automação', view: chatbot },
  { id: 'whatsapp', label: 'Gerenciador de WhatsApp', group: 'Automação', view: whatsapp },
];

const app = document.getElementById('app');
let cleanup = null;
let knownLeadIds = null;

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { id: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(query)) };
}

export function navigate(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${id}${q ? `?${q}` : ''}`;
}

// ---------------- Login ----------------
function renderLogin() {
  document.title = 'Entrar — Vela Inbound';
  app.innerHTML = `
    <div class="login">
      <aside class="login__art">
        <a class="sidebar__brand" href="index.html" style="padding:0">
          <img src="assets/logo.svg" width="36" height="36" alt="" />
          <span><strong>Vela Inbound</strong><small>Prospecção de Consórcios & Crédito</small></span>
        </a>
        <div>
          <h2>Cada lead no lugar certo, na hora certa.</h2>
          <p>Capture, qualifique e distribua leads do simulador para sua equipe de consultores PJ — com chatbots e WhatsApp integrados.</p>
          <ul class="login__feat">
            <li>Lead score automático</li>
            <li>Distribuição Round Robin entre PJs</li>
            <li>Funil Kanban e dashboard do gestor</li>
            <li>Chatbots para leads frios e qualificados</li>
          </ul>
        </div>
        <small style="color:#6f82a3">Protótipo · dados fictícios</small>
      </aside>
      <main class="login__form">
        <form class="login__box" id="login-form" novalidate>
          <h1>Entrar na plataforma</h1>
          <p class="muted" style="margin:0 0 20px">Use uma das contas de demonstração abaixo.</p>
          <div class="form-row"><label for="email">E-mail</label><input id="email" name="email" class="input" type="email" autocomplete="username" required /></div>
          <div class="form-row"><label for="senha">Senha</label><input id="senha" name="senha" class="input" type="password" autocomplete="current-password" required /></div>
          <p class="error-text" id="login-error" role="alert"></p>
          <button class="btn btn--primary btn--block" type="submit" style="padding:11px">Entrar</button>
          <div class="demo-accounts">
            <p>Contas de demonstração (senha <b>123456</b>) — clique para preencher:</p>
            <div>${demoAccounts()
              .map((a) => `<button type="button" class="btn btn--sm" data-email="${esc(a.email)}" title="${esc(a.nome)}">${esc(a.label)}</button>`)
              .join('')}</div>
          </div>
          <p class="small muted" style="margin-top:18px"><a href="index.html">← Voltar para a landing page</a></p>
        </form>
      </main>
    </div>`;
  const form = document.getElementById('login-form');
  form.querySelectorAll('[data-email]').forEach((b) =>
    b.addEventListener('click', () => {
      form.email.value = b.dataset.email;
      form.senha.value = '123456';
      form.querySelector('[type=submit]').focus();
    })
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await login(form.email.value, form.senha.value);
      toast(`Bem-vindo(a), ${user.nome.split(' ')[0]}!`, user.role === 'gestor' ? 'Painel do gestor' : `Área do ${user.codigo}`, '👋');
      start();
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
    }
  });
}

// ---------------- Shell ----------------
function renderShell(user) {
  const allowed = ROUTES.filter((r) => can(user, r.id));
  let lastGroup = '';
  const nav = allowed
    .map((r) => {
      const g = r.group !== lastGroup ? `<div class="nav-group">${esc(r.group)}</div>` : '';
      lastGroup = r.group;
      return `${g}<a class="nav-item" data-route="${r.id}" href="#/${r.id}">${icon(r.id)}<span>${esc(r.label)}</span>${r.id === 'funil' ? '<span class="count" id="nav-count"></span>' : ''}</a>`;
    })
    .join('');

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Menu principal">
        <a class="sidebar__brand" href="#/dashboard">
          <img src="assets/logo.svg" width="34" height="34" alt="" />
          <span><strong>Vela Inbound</strong><small>${user.role === 'gestor' ? 'Painel do gestor' : `Área do vendedor · ${esc(user.codigo)}`}</small></span>
        </a>
        <nav>${nav}</nav>
        <div class="sidebar__foot">
          <div class="me">${avatar(user)}<div><strong>${esc(user.nome)}</strong><span>${user.role === 'gestor' ? esc(user.titulo) : `${esc(user.codigo)} · ${esc(user.regiao)}`}</span></div></div>
          <a class="side-btn" href="index.html" target="_blank" rel="noopener">↗ Abrir landing page</a>
          ${can(user, 'demo:reset') ? '<button class="side-btn" id="reset-demo" type="button">↺ Restaurar dados de demonstração</button>' : ''}
          <button class="side-btn" id="logout" type="button">Sair</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="Abrir menu">${icon('menu')}</button>
          <div><div class="crumb" id="crumb"></div><h1 id="page-title"></h1></div>
          <div class="topbar__right">
            <button class="icon-btn" id="bell" type="button" aria-label="Notificações">${icon('bell')}<span class="badge-dot" id="bell-count" hidden></span></button>
          </div>
        </header>
        <section class="content" id="view"></section>
      </div>
    </div>`;

  const shell = app.querySelector('.shell');
  document.getElementById('menu-btn').addEventListener('click', () => shell.classList.toggle('nav-open'));
  shell.addEventListener('click', (e) => {
    if (e.target === shell || e.target.closest('.nav-item')) shell.classList.remove('nav-open');
  });
  document.getElementById('logout').addEventListener('click', () => {
    logout();
    location.hash = '';
    start();
  });
  document.getElementById('reset-demo')?.addEventListener('click', () => {
    if (!confirm('Restaurar os dados de demonstração? Leads criados nesta sessão serão apagados.')) return;
    resetDemo();
    knownLeadIds = new Set(listLeads().map((l) => l.id));
    toast('Dados restaurados', '30 leads fictícios recarregados');
  });
  document.getElementById('bell').addEventListener('click', () => showNotifications(user));
  updateBadges(user);
}

function showNotifications(user) {
  const list = notificationsFor(user);
  openModal({
    title: 'Notificações',
    size: 'sm',
    body: list.length
      ? `<ul class="history">${list.map((n) => `<li><b>${esc(n.title)}</b> — ${esc(n.body)}<small>${timeAgo(n.at)}</small></li>`).join('')}</ul>`
      : '<div class="empty">Nenhuma notificação por aqui.<br>Quando um lead for distribuído para você, ele aparece nesta lista.</div>',
  });
  markAllRead(user);
}

function updateBadges(user) {
  const unread = notificationsFor(user).filter((n) => !n.read).length;
  const b = document.getElementById('bell-count');
  if (b) {
    b.hidden = !unread;
    b.textContent = unread;
  }
  const c = document.getElementById('nav-count');
  if (c) c.textContent = listLeads(user.role === 'pj' ? { pjId: user.id } : {}).length;
}

// ---------------- Router ----------------
function route() {
  const user = currentUser();
  if (!user) return start();
  const { id, params } = parseHash();
  const r = ROUTES.find((x) => x.id === id && can(user, x.id)) || ROUTES[0];
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('is-active', a.dataset.route === r.id));
  document.getElementById('page-title').textContent = r.view.title?.(user) || r.label;
  document.getElementById('crumb').textContent = r.group;
  document.title = `${r.label} — Vela Inbound`;
  cleanup?.();
  const el = document.getElementById('view');
  el.innerHTML = '';
  cleanup = r.view.render(el, { user, params, navigate }) || null;
  window.scrollTo(0, 0);
}

function start() {
  cleanup?.();
  cleanup = null;
  const user = currentUser();
  if (!user) return renderLogin();
  renderShell(user);
  knownLeadIds = new Set(listLeads().map((l) => l.id));
  route();
}

window.addEventListener('hashchange', () => currentUser() && route());

// Atualização ao vivo: um lead criado na landing (outra aba) aparece aqui.
onDataChange((what) => {
  const user = currentUser();
  if (!user || !document.getElementById('view')) return;
  updateBadges(user);
  if (knownLeadIds) {
    const visible = listLeads(user.role === 'pj' ? { pjId: user.id } : {});
    const fresh = visible.filter((l) => !knownLeadIds.has(l.id));
    fresh.forEach((l) => toast('Novo lead recebido', `${l.nome} · score ${l.score}`, '🔔'));
    listLeads().forEach((l) => knownLeadIds.add(l.id));
  }
});

start();
