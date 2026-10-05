// Equipe de vendedores PJ e desempenho individual.
import { listLeads } from '../../services/leads.js';
import { listPJs } from '../../services/auth.js';
import { avatar, live } from '../components/ui.js';
import { brlShort, esc, pct } from '../format.js';

export const title = () => 'Equipe PJ';

export function render(el, { navigate }) {
  const paint = () => {
    const leads = listLeads();
    const rows = listPJs().map((p) => {
      const mine = leads.filter((l) => l.pjId === p.id);
      const conv = mine.filter((l) => l.status === 'convertido');
      return {
        p,
        total: mine.length,
        novos: mine.filter((l) => l.status === 'distribuido').length,
        atend: mine.filter((l) => ['atendimento', 'proposta'].includes(l.status)).length,
        conv: conv.length,
        perd: mine.filter((l) => l.status === 'perdido').length,
        valor: conv.reduce((s, l) => s + l.valor, 0),
        taxa: mine.length ? (conv.length / mine.length) * 100 : 0,
      };
    });

    el.innerHTML = `
      <div class="banner"><span class="banner__icon">👥</span><div><b>5 vendedores PJ de demonstração.</b> A estrutura suporta os 70 PJs da operação — cadastro em lote, convite por e-mail e permissões granulares entram na próxima versão.</div></div>
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Vendedor</th><th>Login</th><th>Região</th><th class="num">Leads</th><th class="num">A contatar</th><th class="num">Em negociação</th><th class="num">Convertidos</th><th class="num">Perdidos</th><th class="num">Conversão</th><th class="num">Volume convertido</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td><div class="cell-user">${avatar(r.p)}<span><b>${esc(r.p.codigo)}</b><small>${esc(r.p.nome)}</small></span></div></td>
            <td class="muted">${esc(r.p.email)}</td>
            <td>${esc(r.p.regiao)}</td>
            <td class="num"><b>${r.total}</b></td>
            <td class="num">${r.novos}</td>
            <td class="num">${r.atend}</td>
            <td class="num">${r.conv}</td>
            <td class="num">${r.perd}</td>
            <td class="num">${pct(r.taxa)}</td>
            <td class="num">${brlShort(r.valor)}</td>
            <td><button class="btn btn--sm" data-pj="${r.p.id}" type="button">Ver funil</button></td></tr>`
          )
          .join('')}</tbody></table></div></div>`;
    el.querySelectorAll('[data-pj]').forEach((b) => b.addEventListener('click', () => navigate('funil', { pj: b.dataset.pj })));
  };
  return live(paint);
}
