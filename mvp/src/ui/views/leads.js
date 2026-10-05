// Tabela de leads com busca, filtros e exportação CSV.
import { listLeads } from '../../services/leads.js';
import { listPJs, userById } from '../../services/auth.js';
import { STAGES, stageById, creditTypeById } from '../../data/catalog.js';
import { avatar, scoreBadge, stagePill, icon, live } from '../components/ui.js';
import { openLeadModal } from '../components/leadModal.js';
import { brl, date, esc } from '../format.js';

export const title = (user) => (user.role === 'gestor' ? 'Todos os leads' : 'Meus leads');

export function render(el, { user, params }) {
  const f = { q: '', status: params.status || '', pj: params.pj || '' };

  el.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon('search')}<input class="input" id="f-q" placeholder="Buscar…" aria-label="Buscar" /></label>
      <select class="select" id="f-status" aria-label="Etapa"><option value="">Todas as etapas</option>${STAGES.map((s) => `<option value="${s.id}" ${f.status === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      ${
        user.role === 'gestor'
          ? `<select class="select" id="f-pj" aria-label="PJ"><option value="">Todos os PJs</option>${listPJs().map((p) => `<option value="${p.id}" ${f.pj === p.id ? 'selected' : ''}>${esc(p.codigo)}</option>`).join('')}</select>`
          : ''
      }
      <span class="spacer small muted" id="count"></span>
      <button class="btn" id="export" type="button">Exportar CSV</button>
    </div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Lead</th><th>WhatsApp</th><th>Tipo de crédito</th><th class="num">Valor</th><th>Score</th><th>Etapa</th><th>PJ</th><th>Origem</th><th class="num">Criado em</th></tr></thead>
      <tbody id="rows"></tbody></table></div></div>`;

  const filtered = () => {
    let leads = listLeads({ q: f.q, status: f.status, pjId: user.role === 'pj' ? user.id : f.pj || undefined });
    return leads;
  };

  const paint = () => {
    const leads = filtered();
    el.querySelector('#count').textContent = `${leads.length} lead(s)`;
    el.querySelector('#rows').innerHTML =
      leads
        .map((l) => {
          const pj = userById(l.pjId);
          return `<tr class="is-click" data-lead="${l.id}">
          <td><div class="cell-user"><span><b>${esc(l.nome)}</b><small>${l.id} · ${esc(l.cidade)}</small></span></div></td>
          <td>${esc(l.whatsapp)}</td>
          <td>${esc(creditTypeById(l.tipoCredito).label)}</td>
          <td class="num">${brl(l.valor)}</td>
          <td>${scoreBadge(l.score)}</td>
          <td>${stagePill(stageById(l.status))}</td>
          <td>${pj ? `<div class="cell-user">${avatar(pj)}<span>${esc(pj.codigo)}</span></div>` : '<span class="muted">—</span>'}</td>
          <td class="muted">${esc(l.origem)}</td>
          <td class="num muted">${date(l.createdAt)}</td></tr>`;
        })
        .join('') || '<tr><td colspan="9" class="empty">Nenhum lead encontrado.</td></tr>';
    el.querySelectorAll('[data-lead]').forEach((tr) => tr.addEventListener('click', () => openLeadModal(tr.dataset.lead, user)));
  };

  el.querySelector('#f-q').addEventListener('input', (e) => ((f.q = e.target.value), paint()));
  el.querySelector('#f-status').addEventListener('change', (e) => ((f.status = e.target.value), paint()));
  el.querySelector('#f-pj')?.addEventListener('change', (e) => ((f.pj = e.target.value), paint()));
  el.querySelector('#export').addEventListener('click', () => {
    const cols = ['id', 'nome', 'whatsapp', 'email', 'cidade', 'tipo', 'valor', 'renda', 'score', 'etapa', 'pj', 'origem', 'criado_em'];
    const lines = filtered().map((l) =>
      [l.id, l.nome, l.whatsapp, l.email, l.cidade, creditTypeById(l.tipoCredito).label, l.valor, l.renda, l.score, stageById(l.status).label, userById(l.pjId)?.codigo || '', l.origem, date(l.createdAt)]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(';')
    );
    const blob = new Blob(['﻿' + [cols.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-vela-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  return live(paint);
}
