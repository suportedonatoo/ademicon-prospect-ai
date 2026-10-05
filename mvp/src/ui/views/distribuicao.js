// Distribuição Round Robin: fila visual, leads aguardando e histórico.
import { listLeads, createLeadFromSimulation, distributeLead, assignLead } from '../../services/leads.js';
import { listPJs, userById } from '../../services/auth.js';
import { peekNextPJ, distributionLog } from '../../services/distribution.js';
import { creditTypeById } from '../../data/catalog.js';
import { fakeLeadForm } from '../../data/fakeLead.js';
import { avatar, scoreBadge, toast, live } from '../components/ui.js';
import { openLeadModal } from '../components/leadModal.js';
import { brl, dateTime, esc, timeAgo } from '../format.js';

export const title = () => 'Distribuição de leads';

export function render(el, { user }) {
  let flash = null;
  let filterPj = '';

  const paint = () => {
    const pjs = listPJs();
    const next = peekNextPJ();
    const leads = listLeads();
    const waiting = leads.filter((l) => !l.pjId && l.status === 'qualificado');
    let log = distributionLog();
    if (filterPj) log = log.filter((d) => d.pjId === filterPj);
    const counts = Object.fromEntries(pjs.map((p) => [p.id, leads.filter((l) => l.pjId === p.id).length]));

    el.innerHTML = `
      <div class="card">
        <div class="card__head">
          <div><h3>Fila Round Robin</h3><p>Cada novo lead qualificado vai para o próximo PJ da fila. Depois do último, a fila volta ao primeiro.</p></div>
          <button class="spacer btn btn--primary" id="sim-lead" type="button">⚡ Simular chegada de lead qualificado</button>
        </div>
        <div class="card__body">
          <div class="rr">${pjs
            .map(
              (p, i) => `${i ? '<span class="rr__arrow" aria-hidden="true">→</span>' : ''}
              <div class="rr__node ${p.id === next.id ? 'is-next' : ''} ${p.id === flash ? 'is-flash' : ''}">
                ${avatar(p)}<div>${p.id === next.id ? '<span class="rr__tag">Próximo da fila</span>' : ''}<b>${esc(p.codigo)}</b><small>${esc(p.nome)} · ${counts[p.id]} leads</small></div>
              </div>`
            )
            .join('')}<span class="rr__arrow" aria-hidden="true" title="volta ao início">↺</span></div>
          <p class="small muted" style="margin:14px 0 0">Estrutura pronta para 70 PJs. Estratégias futuras (peso por desempenho, região, produto, horário) entram em <code>src/services/distribution.js</code> sem mudar as telas.</p>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div><h3>Aguardando distribuição</h3><p>Leads qualificados sem PJ responsável</p></div></div>
        ${
          waiting.length
            ? `<div class="table-wrap"><table class="table"><thead><tr><th>Lead</th><th>Tipo</th><th class="num">Valor</th><th>Score</th><th>Atribuir</th></tr></thead><tbody>
          ${waiting
            .map(
              (l) => `<tr><td><div class="cell-user"><span><b>${esc(l.nome)}</b><small>${l.id} · ${esc(l.cidade)}</small></span></div></td>
              <td>${esc(creditTypeById(l.tipoCredito).label)}</td><td class="num">${brl(l.valor)}</td><td>${scoreBadge(l.score)}</td>
              <td><div class="toolbar"><button class="btn btn--sm btn--primary" data-rr="${l.id}" type="button">Round Robin → ${esc(next.codigo)}</button>
                <select class="select" data-manual="${l.id}" aria-label="Atribuir manualmente"><option value="">ou escolher PJ…</option>${pjs.map((p) => `<option value="${p.id}">${esc(p.codigo)}</option>`).join('')}</select></div></td></tr>`
            )
            .join('')}</tbody></table></div>`
            : '<div class="empty">Nenhum lead aguardando. Leads que escolhem “Tenho interesse” são distribuídos automaticamente.</div>'
        }
      </div>

      <div class="card">
        <div class="card__head">
          <div><h3>Histórico de distribuição</h3><p>${log.length} registro(s) · qual PJ recebeu cada lead</p></div>
          <select class="spacer select" id="f-pj" aria-label="Filtrar por PJ"><option value="">Todos os PJs</option>${pjs.map((p) => `<option value="${p.id}" ${filterPj === p.id ? 'selected' : ''}>${esc(p.codigo)}</option>`).join('')}</select>
        </div>
        <div class="table-wrap" style="margin-top:12px"><table class="table">
          <thead><tr><th>#</th><th>Lead</th><th>Recebido por</th><th>Método</th><th class="num">Data</th></tr></thead>
          <tbody>${log
            .map((d, i) => {
              const l = leads.find((x) => x.id === d.leadId);
              const pj = userById(d.pjId);
              return `<tr class="is-click" data-lead="${d.leadId}"><td class="muted">${log.length - i}</td>
                <td><div class="cell-user"><span><b>${d.leadId} → ${esc(pj.codigo)}</b><small>${esc(l?.nome || '')}</small></span></div></td>
                <td><div class="cell-user">${avatar(pj)}<span><b>${esc(pj.nome)}</b><small>${esc(pj.regiao)}</small></span></div></td>
                <td><span class="pill">${d.metodo === 'manual' ? 'Manual' : 'Round Robin'}</span></td>
                <td class="num muted" title="${dateTime(d.at)}">${timeAgo(d.at)}</td></tr>`;
            })
            .join('')}</tbody></table></div>
      </div>`;

    el.querySelector('#sim-lead').addEventListener('click', () => {
      const { lead, pj } = createLeadFromSimulation(fakeLeadForm({ interesse: true }));
      flash = pj.id;
      toast('Novo lead qualificado', `${lead.id} ${lead.nome} → ${pj.codigo}`, '🔁');
      setTimeout(() => {
        flash = null;
        paint();
      }, 1400);
    });
    el.querySelectorAll('[data-rr]').forEach((b) =>
      b.addEventListener('click', () => {
        const { lead, pj } = distributeLead(b.dataset.rr);
        flash = pj.id;
        toast('Lead distribuído', `${lead.nome} → ${pj.codigo}`, '🔁');
      })
    );
    el.querySelectorAll('[data-manual]').forEach((s) =>
      s.addEventListener('change', () => {
        if (!s.value) return;
        const l = assignLead(s.dataset.manual, s.value, user.nome);
        toast('Atribuído manualmente', `${l.nome} → ${userById(s.value).codigo}`, '👤');
      })
    );
    el.querySelector('#f-pj').addEventListener('change', (e) => ((filterPj = e.target.value), paint()));
    el.querySelectorAll('[data-lead]').forEach((tr) => tr.addEventListener('click', () => openLeadModal(tr.dataset.lead, user)));
  };

  return live(paint);
}
