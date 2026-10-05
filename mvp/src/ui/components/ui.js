// Componentes básicos da plataforma: modal, toast, ícones, badges.
import { esc, initials } from '../format.js';
import { temperature } from '../../services/scoring.js';

// ---------- Modal ----------
export function openModal({ title, subtitle = '', body = '', footer = '', size = '' }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal ${size ? `modal--${size}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head">
        <div><h2>${esc(title)}</h2><div class="muted small">${subtitle}</div></div>
        <button class="modal__close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
    </div>`;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    back.dispatchEvent(new CustomEvent('closed'));
  };
  const onKey = (e) => e.key === 'Escape' && close();
  back.addEventListener('mousedown', (e) => e.target === back && close());
  back.querySelector('.modal__close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  return { el: back, close };
}

// ---------- Toast ----------
export function toast(title, body = '', icon = '✓') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span><div><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}</div>`;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ---------- Pequenos pedaços de HTML ----------
const PJ_COLORS = { pj001: '#2a78d6', pj002: '#0f9f6e', pj003: '#7c3aed', pj004: '#d9480f', pj005: '#0e7490', gestor: '#0c1a33' };
export const colorFor = (id) => PJ_COLORS[id] || '#475569';

export function avatar(user, cls = '') {
  if (!user) return `<span class="avatar ${cls}" style="--av:#cbd5e1">?</span>`;
  return `<span class="avatar ${cls}" style="--av:${colorFor(user.id)}" title="${esc(user.nome)}">${esc(initials(user.nome))}</span>`;
}

export function scoreBadge(score) {
  const t = temperature(score);
  return `<span class="score score--${t.tone}" title="Score ${score} · ${t.label}">${score}</span>`;
}

export function tempPill(score) {
  const t = temperature(score);
  return `<span class="pill pill--${t.tone}"><i></i>${t.label}</span>`;
}

export function stagePill(stage) {
  return `<span class="pill" style="color:${stage.color}"><i></i><span style="color:var(--ink-2)">${esc(stage.label)}</span></span>`;
}

// ---------- Ícones (SVG inline, traço) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  funil: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  leads: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  distribuicao: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  equipe: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/>',
  chatbot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4"/><circle cx="9" cy="13" r="1.2"/><circle cx="15" cy="13" r="1.2"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4Z"/><path d="M9 10c.5 2 2 3.5 4 4l1.3-1.3 2 .8-.4 1.7c-4 .5-8-3.5-7.5-7.5l1.7-.4.8 2Z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  external: '<path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// Re-renderiza uma tela sempre que os dados mudam (inclusive em outra aba).
// Retorna a função de limpeza usada pelo roteador.
import { onDataChange } from '../../services/storage.js';
export function live(renderFn) {
  let queued = false;
  renderFn();
  return onDataChange(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      renderFn();
    }, 0);
  });
}
