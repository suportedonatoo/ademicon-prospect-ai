// Modal de detalhes do lead: dados, score detalhado, histórico e ações.
import { getLead, moveLead, assignLead, distributeLead, addNote } from '../../services/leads.js';
import { scoreBreakdown, temperature } from '../../services/scoring.js';
import { listPJs, userById, can } from '../../services/auth.js';
import { onDataChange } from '../../services/storage.js';
import { STAGES, stageById, creditTypeById } from '../../data/catalog.js';
import { openModal, toast, avatar, tempPill, stagePill } from './ui.js';
import { brl, date, dateTime, esc, maskedDoc } from '../format.js';

export function openLeadModal(id, user) {
  const lead = getLead(id);
  if (!lead) return toast('Lead não encontrado', id, '⚠️');
  if (user.role === 'pj' && lead.pjId !== user.id) return toast('Sem acesso', 'Este lead pertence a outro PJ.', '🔒');

  const m = openModal({ title: lead.nome, subtitle: '', body: '', size: '' });
  const render = () => {
    const l = getLead(id);
    const pj = userById(l.pjId);
    const t = temperature(l.score);
    const stage = stageById(l.status);
    m.el.querySelector('.modal__head h2').textContent = l.nome;
    m.el.querySelector('.modal__head .muted').innerHTML = `${l.id} · criado em ${date(l.createdAt)} · origem: ${esc(l.origem)}`;
    m.el.querySelector('.modal__body').innerHTML = `
      <div class="toolbar" style="margin-bottom:16px">${stagePill(stage)} ${tempPill(l.score)}
        ${l.interesse ? '<span class="pill pill--ok">Tem interesse</span>' : '<span class="pill pill--off">Somente simulou</span>'}
        ${l.chatbotEngajado ? '<span class="pill">🤖 Engajou no chatbot</span>' : ''}
      </div>
      <div class="lead-grid">
        <div>
          <dl class="dl">
            <div><dt>WhatsApp</dt><dd>${esc(l.whatsapp)}</dd></div>
            <div><dt>E-mail</dt><dd>${esc(l.email)}</dd></div>
            <div><dt>${esc(l.tipoDocumento)}</dt><dd>${esc(maskedDoc(l.documento))}</dd></div>
            <div><dt>Cidade</dt><dd>${esc(l.cidade)}</dd></div>
            <div><dt>Tipo de crédito</dt><dd>${esc(creditTypeById(l.tipoCredito).label)}</dd></div>
            <div><dt>Valor desejado</dt><dd>${brl(l.valor)}</dd></div>
            <div><dt>Faixa de renda</dt><dd>${esc(l.renda || '—')}</dd></div>
            <div><dt>PJ responsável</dt><dd>${pj ? `<span class="cell-user">${avatar(pj)}<span><b>${esc(pj.codigo)}</b><small>${esc(pj.nome)}</small></span></span>` : '<span class="muted">Aguardando distribuição</span>'}</dd></div>
          </dl>

          <div class="section-title">Ações</div>
          <div class="form-row">
            <label for="lm-stage">Etapa do funil</label>
            <select id="lm-stage" class="select">${STAGES.map((s) => `<option value="${s.id}" ${s.id === l.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          </div>
          ${
            can(user, 'lead:assign')
              ? `<div class="form-row">
              <label for="lm-pj">PJ responsável</label>
              <div class="toolbar">
                <select id="lm-pj" class="select" style="flex:1">
                  <option value="">— selecionar —</option>
                  ${listPJs().map((p) => `<option value="${p.id}" ${p.id === l.pjId ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nome)}</option>`).join('')}
                </select>
                ${!l.pjId ? '<button class="btn btn--primary" id="lm-rr" type="button">Distribuir (Round Robin)</button>' : ''}
              </div>
            </div>`
              : ''
          }
          <div class="form-row">
            <label for="lm-note">Adicionar anotação</label>
            <div class="toolbar">
              <input id="lm-note" class="input" style="flex:1" placeholder="Ex.: cliente pediu contato após 18h" />
              <button class="btn" id="lm-add-note" type="button">Salvar</button>
            </div>
          </div>
          <div class="toolbar">
            <a class="btn" href="#/chatbot?lead=${l.id}">🤖 Abrir chatbot com este lead</a>
            <button class="btn" type="button" disabled title="Disponível após integração com a WhatsApp Business API">Enviar WhatsApp (em breve)</button>
          </div>
        </div>

        <div>
          <div class="score-box">
            <div class="score-box__top"><strong>${l.score}</strong><span class="muted">/ 100 pontos</span><span style="margin-left:auto">${tempPill(l.score)}</span></div>
            <div class="meter" role="meter" aria-valuenow="${l.score}" aria-valuemin="0" aria-valuemax="100"><i style="width:${l.score}%"></i></div>
            <ul class="rules">${scoreBreakdown(l)
              .map((r) => `<li class="${r.hit ? 'is-hit' : ''}"><span>${r.hit ? '✓' : '○'} ${esc(r.label)}</span><b>+${r.points}</b></li>`)
              .join('')}</ul>
            <p class="small muted" style="margin:10px 0 0">0–30 Frio · 31–60 Morno · 61–100 Qualificado (${esc(t.label)})</p>
          </div>
          <div class="section-title">Histórico</div>
          <ul class="history">${[...(l.historico || [])]
            .reverse()
            .map((h) => `<li>${esc(h.texto)}<small>${dateTime(h.at)} · ${esc(h.autor || 'Sistema')}</small></li>`)
            .join('')}</ul>
        </div>
      </div>`;
    bind(l);
  };

  const bind = (l) => {
    const $ = (s) => m.el.querySelector(s);
    $('#lm-stage').addEventListener('change', (e) => {
      const { distributedTo } = moveLead(l.id, e.target.value, user.codigo || user.nome);
      toast('Etapa atualizada', `${l.nome} → ${stageById(e.target.value).label}`);
      if (distributedTo) toast('Distribuído automaticamente', `${distributedTo.codigo} via Round Robin`, '🔁');
    });
    $('#lm-pj')?.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const pj = userById(e.target.value);
      assignLead(l.id, pj.id, user.nome);
      toast('Responsável atualizado', `${l.nome} → ${pj.codigo}`, '👤');
    });
    $('#lm-rr')?.addEventListener('click', () => {
      const { pj } = distributeLead(l.id);
      toast('Lead distribuído', `${l.nome} → ${pj.codigo} (Round Robin)`, '🔁');
    });
    const saveNote = () => {
      const v = $('#lm-note').value.trim();
      if (!v) return;
      addNote(l.id, v, user.codigo || user.nome);
      toast('Anotação salva');
    };
    $('#lm-add-note').addEventListener('click', saveNote);
    $('#lm-note').addEventListener('keydown', (e) => e.key === 'Enter' && saveNote());
    m.el.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', () => m.close()));
  };

  render();
  const off = onDataChange(() => document.body.contains(m.el) && render());
  m.el.addEventListener('closed', off);
  return m;
}
