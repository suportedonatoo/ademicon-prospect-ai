// Funil de leads em Kanban com arrastar-e-soltar.
import { listLeads, moveLead } from '../../services/leads.js';
import { listPJs, userById, can } from '../../services/auth.js';
import { temperature } from '../../services/scoring.js';
import { STAGES, CREDIT_TYPES, stageById, creditTypeById } from '../../data/catalog.js';
import { avatar, scoreBadge, toast, icon, live } from '../components/ui.js';
import { openLeadModal } from '../components/leadModal.js';
import { brl, brlShort, date, esc } from '../format.js';

export const title = (user) => (user.role === 'gestor' ? 'Funil de leads' : 'Meu funil');

export function render(el, { user, params }) {
  const f = { q: '', pj: params.pj || '', tipo: '', temp: '' };
  const highlight = params.lead;

  el.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon('search')}<input class="input" id="f-q" placeholder="Buscar nome, telefone, cidade…" aria-label="Buscar" /></label>
      ${
        user.role === 'gestor'
          ? `<select class="select" id="f-pj" aria-label="Filtrar por PJ"><option value="">Todos os PJs</option><option value="none">Sem responsável</option>${listPJs()
              .map((p) => `<option value="${p.id}" ${f.pj === p.id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nome)}</option>`)
              .join('')}</select>`
          : ''
      }
      <select class="select" id="f-tipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${CREDIT_TYPES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>
      <select class="select" id="f-temp" aria-label="Filtrar por temperatura"><option value="">Todas as temperaturas</option><option value="frio">Frio</option><option value="morno">Morno</option><option value="qualificado">Qualificado</option></select>
      <span class="spacer small muted hide-sm">Arraste os cards entre as etapas · clique para detalhes</span>
    </div>
    <div class="kanban" id="kanban"></div>`;

  const board = el.querySelector('#kanban');
  let firstPaint = true;

  const paint = () => {
    const scrollLeft = board.scrollLeft;
    let leads = listLeads(user.role === 'pj' ? { pjId: user.id, q: f.q } : { q: f.q });
    if (f.pj === 'none') leads = leads.filter((l) => !l.pjId);
    else if (f.pj) leads = leads.filter((l) => l.pjId === f.pj);
    if (f.tipo) leads = leads.filter((l) => l.tipoCredito === f.tipo);
    if (f.temp) leads = leads.filter((l) => temperature(l.score).id === f.temp);

    board.innerHTML = STAGES.map((s) => {
      const items = leads.filter((l) => l.status === s.id);
      return `<div class="col" data-stage="${s.id}">
        <div class="col__head"><span class="col__dot" style="background:${s.color}"></span><b>${esc(s.label)}</b><span class="col__count">${items.length}</span>
          <span class="col__sum">${brlShort(items.reduce((t, l) => t + l.valor, 0))}</span></div>
        <div class="col__body">${items.map((l) => card(l, firstPaint && l.id === highlight)).join('') || '<div class="empty small" style="padding:14px 4px">Arraste leads para cá</div>'}</div>
      </div>`;
    }).join('');
    board.scrollLeft = scrollLeft;
    bind();
    if (firstPaint && highlight) {
      firstPaint = false;
      const c = board.querySelector(`[data-id="${highlight}"]`);
      c?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      if (c) setTimeout(() => openLeadModal(highlight, user), 500);
      else toast('Lead não visível', 'Ele pode pertencer a outro PJ ou estar filtrado.', 'ℹ️');
    }
  };

  const card = (l, isNew) => {
    const pj = userById(l.pjId);
    const t = temperature(l.score);
    return `<article class="lcard ${isNew ? 'is-new' : ''}" draggable="${can(user, 'lead:move')}" data-id="${l.id}" tabindex="0" aria-label="${esc(l.nome)}">
      <div class="lcard__top"><div><div class="lcard__name">${esc(l.nome)}</div><div class="lcard__id">${l.id} · ${esc(t.label)}</div></div>${scoreBadge(l.score)}</div>
      <div class="lcard__meta">
        <div><span>WhatsApp</span>${esc(l.whatsapp)}</div>
        <div><span>Tipo</span>${esc(creditTypeById(l.tipoCredito).label.replace('Consórcio', 'Cons.').replace('Crédito com Garantia de', 'Garantia'))}</div>
        <div><span>Valor</span><b>${brl(l.valor)}</b></div>
        <div><span>Status</span>${esc(stageById(l.status).label)}</div>
      </div>
      <div class="lcard__foot">${pj ? `${avatar(pj)}<span>${esc(pj.codigo)}</span>` : '<span>🤖 Sem PJ (nutrição)</span>'}<time datetime="${new Date(l.createdAt).toISOString()}">${date(l.createdAt)}</time></div>
    </article>`;
  };

  const bind = () => {
    board.querySelectorAll('.lcard').forEach((c) => {
      c.addEventListener('click', () => openLeadModal(c.dataset.id, user));
      c.addEventListener('keydown', (e) => e.key === 'Enter' && openLeadModal(c.dataset.id, user));
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        c.classList.add('is-dragging');
      });
      c.addEventListener('dragend', () => c.classList.remove('is-dragging'));
    });
    board.querySelectorAll('.col').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('is-over');
      });
      col.addEventListener('dragleave', (e) => !col.contains(e.relatedTarget) && col.classList.remove('is-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-over');
        const id = e.dataTransfer.getData('text/plain');
        const stage = col.dataset.stage;
        if (!id) return;
        const { lead, distributedTo } = moveLead(id, stage, user.codigo || user.nome);
        toast('Lead movido', `${lead.nome} → ${stageById(stage).label}`);
        if (distributedTo) toast('Distribuído automaticamente', `${lead.nome} → ${distributedTo.codigo} (Round Robin)`, '🔁');
      });
    });
  };

  el.querySelector('#f-q').addEventListener('input', (e) => ((f.q = e.target.value), paint()));
  el.querySelector('#f-pj')?.addEventListener('change', (e) => ((f.pj = e.target.value), paint()));
  el.querySelector('#f-tipo').addEventListener('change', (e) => ((f.tipo = e.target.value), paint()));
  el.querySelector('#f-temp').addEventListener('change', (e) => ((f.temp = e.target.value), paint()));

  return live(paint);
}
