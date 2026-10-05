// Dashboard: visão geral (gestor) ou "meu desempenho" (PJ).
import { listLeads, metrics } from '../../services/leads.js';
import { listPJs, userById } from '../../services/auth.js';
import { distributionLog } from '../../services/distribution.js';
import { temperature } from '../../services/scoring.js';
import { STAGES, CREDIT_TYPES, stageById, creditTypeById } from '../../data/catalog.js';
import { hBars, columns, stackedShare, bindTooltips } from '../components/charts.js';
import { avatar, scoreBadge, stagePill, live } from '../components/ui.js';
import { openLeadModal } from '../components/leadModal.js';
import { brl, brlShort, pct, esc, timeAgo } from '../format.js';

export const title = (user) => (user.role === 'gestor' ? 'Dashboard do gestor' : `Olá, ${user.nome.split(' ')[0]}`);

const kpi = (label, value, sub = '', hero = false) =>
  `<div class="card kpi ${hero ? 'kpi--hero' : ''}"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

function leadsPerDay(leads, days = 14) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d0 = today.getTime() - i * 86400000;
    const n = leads.filter((l) => l.createdAt >= d0 && l.createdAt < d0 + 86400000).length;
    const d = new Date(d0);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label, value: n, tip: `<b>${label}</b><br>${n} lead${n === 1 ? '' : 's'}` });
  }
  return out;
}

function temperatureShare(leads) {
  const c = { frio: 0, morno: 0, qualificado: 0 };
  leads.forEach((l) => c[temperature(l.score).id]++);
  // Rampa ordinal de um só tom (frio → quente = claro → escuro)
  return [
    { label: 'Frio (0–30)', value: c.frio, color: 'var(--ramp-1)' },
    { label: 'Morno (31–60)', value: c.morno, color: 'var(--ramp-2)' },
    { label: 'Qualificado (61–100)', value: c.qualificado, color: 'var(--ramp-4)' },
  ];
}

export function render(el, { user, navigate }) {
  return live(() => (user.role === 'gestor' ? renderGestor(el, navigate, user) : renderPJ(el, user)));
}

function renderGestor(el, navigate, user) {
  const leads = listLeads();
  const m = metrics();
  const pjs = listPJs();
  const perPJ = pjs.map((p) => {
    const mine = leads.filter((l) => l.pjId === p.id);
    const conv = mine.filter((l) => l.status === 'convertido').length;
    return { pj: p, total: mine.length, conv, atend: mine.filter((l) => ['atendimento', 'proposta'].includes(l.status)).length };
  });
  const byStage = STAGES.map((s) => ({ label: s.label, value: leads.filter((l) => l.status === s.id).length }));
  const byType = CREDIT_TYPES.map((c) => ({
    label: c.label,
    value: leads.filter((l) => l.tipoCredito === c.id).length,
    sub: brlShort(leads.filter((l) => l.tipoCredito === c.id).reduce((s, l) => s + l.valor, 0)),
  })).sort((a, b) => b.value - a.value);
  const log = distributionLog().slice(0, 6);
  const semDono = leads.filter((l) => !l.pjId && l.status === 'qualificado').length;

  el.innerHTML = `
    ${semDono ? `<div class="banner"><span class="banner__icon">⚡</span><div><b>${semDono} lead(s) qualificado(s) aguardando distribuição.</b> <a href="#/distribuicao">Distribuir agora →</a></div></div>` : ''}
    <div class="kpis">
      ${kpi('Total de leads', m.total, `${brlShort(m.pipeline)} em negociação`, true)}
      ${kpi('Leads novos', m.novos, 'aguardando triagem')}
      ${kpi('Qualificados', m.qualificados, `${pct(m.total ? (m.qualificados / m.total) * 100 : 0)} do total`)}
      ${kpi('Em atendimento', m.atendimento, `+ ${m.proposta} em proposta`)}
      ${kpi('Convertidos', m.convertidos, brlShort(m.valorConvertido))}
      ${kpi('Perdidos', m.perdidos, '')}
      ${kpi('Taxa de conversão', pct(m.taxaConversao), `fechamento: ${pct(m.taxaFechamento)}`)}
    </div>

    <div class="grid grid-3-1">
      <div class="card">
        <div class="card__head"><div><h3>Leads por dia</h3><p>Entradas nos últimos 14 dias</p></div></div>
        <div class="card__body">${columns(leadsPerDay(leads))}</div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Temperatura (Lead Score)</h3><p>Distribuição da base por faixa de score</p></div></div>
        <div class="card__body">${stackedShare(temperatureShare(leads))}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card__head"><div><h3>Leads por PJ</h3><p>Distribuídos via Round Robin + atribuições manuais</p></div><a class="spacer btn btn--sm" href="#/equipe">Ver equipe</a></div>
        <div class="card__body">${hBars(
          perPJ.map((r) => ({ label: `${r.pj.codigo} · ${r.pj.nome.split(' ')[0]}`, value: r.total, sub: `${r.atend} em atendimento, ${r.conv} convertido(s)` })),
          { format: (v) => `${v} leads` }
        )}</div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Funil por etapa</h3><p>Quantidade de leads em cada coluna do Kanban</p></div><a class="spacer btn btn--sm" href="#/funil">Abrir funil</a></div>
        <div class="card__body">${hBars(byStage, { format: (v) => `${v}` })}</div>
      </div>
    </div>

    <div class="grid grid-1-2">
      <div class="card">
        <div class="card__head"><div><h3>Por tipo de crédito</h3><p>Quantidade de leads · volume solicitado</p></div></div>
        <div class="card__body">${hBars(byType, { format: (v) => `${v}` })}</div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Últimas distribuições</h3><p>Qual PJ recebeu cada lead</p></div><a class="spacer btn btn--sm" href="#/distribuicao">Ver todas</a></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Lead</th><th>PJ</th><th>Método</th><th class="num">Quando</th></tr></thead>
          <tbody>${log
            .map((d) => {
              const lead = leads.find((l) => l.id === d.leadId);
              const pj = userById(d.pjId);
              return `<tr class="is-click" data-lead="${d.leadId}">
                <td><div class="cell-user"><span><b>${esc(lead?.nome || d.leadId)}</b><small>${d.leadId} · ${esc(creditTypeById(lead?.tipoCredito).label)}</small></span></div></td>
                <td><div class="cell-user">${avatar(pj)}<span><b>${esc(pj.codigo)}</b><small>${esc(pj.nome)}</small></span></div></td>
                <td><span class="pill">${d.metodo === 'manual' ? 'Manual' : 'Round Robin'}</span></td>
                <td class="num muted">${timeAgo(d.at)}</td></tr>`;
            })
            .join('')}</tbody></table></div>
      </div>
    </div>`;
  bindTooltips(el);
  el.querySelectorAll('[data-lead]').forEach((tr) => tr.addEventListener('click', () => openLeadModal(tr.dataset.lead, user)));
}

function renderPJ(el, user) {
  const leads = listLeads({ pjId: user.id });
  const m = metrics({ pjId: user.id });
  const todo = leads.filter((l) => l.status === 'distribuido');
  const active = leads.filter((l) => ['atendimento', 'proposta'].includes(l.status));
  const byStage = STAGES.filter((s) => leads.some((l) => l.status === s.id)).map((s) => ({ label: s.label, value: leads.filter((l) => l.status === s.id).length }));

  const row = (l) => `<tr class="is-click" data-lead="${l.id}">
      <td><div class="cell-user"><span><b>${esc(l.nome)}</b><small>${esc(l.whatsapp)}</small></span></div></td>
      <td>${esc(creditTypeById(l.tipoCredito).label)}</td>
      <td class="num">${brl(l.valor)}</td>
      <td>${scoreBadge(l.score)}</td>
      <td>${stagePill(stageById(l.status))}</td>
      <td class="num muted">${timeAgo(l.createdAt)}</td></tr>`;

  el.innerHTML = `
    <div class="banner"><span class="banner__icon">🔒</span><div><b>Área do vendedor ${esc(user.codigo)}.</b> Você visualiza somente os leads distribuídos para você.</div></div>
    <div class="kpis">
      ${kpi('Meus leads', m.total, `${brlShort(m.pipeline)} em negociação`, true)}
      ${kpi('Para contatar', todo.length, 'recém-distribuídos')}
      ${kpi('Em atendimento', m.atendimento, `+ ${m.proposta} em proposta`)}
      ${kpi('Convertidos', m.convertidos, brlShort(m.valorConvertido))}
      ${kpi('Perdidos', m.perdidos)}
      ${kpi('Taxa de conversão', pct(m.taxaConversao))}
    </div>
    <div class="grid grid-3-1">
      <div class="card">
        <div class="card__head"><div><h3>Próximas ações</h3><p>Leads recém-distribuídos e negociações em andamento</p></div><a class="spacer btn btn--sm" href="#/funil">Abrir meu funil</a></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Lead</th><th>Tipo</th><th class="num">Valor</th><th>Score</th><th>Etapa</th><th class="num">Criado</th></tr></thead>
          <tbody>${[...todo, ...active].map(row).join('') || '<tr><td colspan="6" class="empty">Nenhuma ação pendente 🎉</td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Meus leads por etapa</h3></div></div>
        <div class="card__body">${byStage.length ? hBars(byStage) : '<div class="empty">Sem leads ainda.</div>'}</div>
      </div>
    </div>`;
  bindTooltips(el);
  el.querySelectorAll('[data-lead]').forEach((tr) => tr.addEventListener('click', () => openLeadModal(tr.dataset.lead, user)));
}
