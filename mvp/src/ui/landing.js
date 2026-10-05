// Landing page: simulador + criação do lead + chatbot flutuante.
import { CREDIT_TYPES, INCOME_RANGES } from '../data/catalog.js';
import { simulate } from '../integrations/creditApi.js';
import { createLeadFromSimulation, chatbotEngaged, chatbotInterest, chatbotTransfer } from '../services/leads.js';
import { mountChat } from './components/chat.js';
import { brl, esc, maskPhone, maskDoc, maskMoney, unmaskMoney } from './format.js';

const form = document.getElementById('sim-form');
const resultBox = document.getElementById('sim-result');
const errorBox = document.getElementById('form-error');

// Preenche selects a partir do catálogo
form.tipoCredito.innerHTML =
  '<option value="" disabled selected>Selecione</option>' + CREDIT_TYPES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
form.renda.innerHTML =
  '<option value="" disabled selected>Selecione</option>' + INCOME_RANGES.map((r) => `<option>${esc(r)}</option>`).join('');

// Máscaras
form.whatsapp.addEventListener('input', (e) => (e.target.value = maskPhone(e.target.value)));
form.documento.addEventListener('input', (e) => (e.target.value = maskDoc(e.target.value)));
form.valor.addEventListener('input', (e) => (e.target.value = maskMoney(e.target.value)));
form.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('is-invalid'));

function validate(data) {
  const errors = [];
  const mark = (name, msg) => {
    form[name].closest('.field')?.classList.add('is-invalid');
    errors.push(msg);
  };
  if (data.nome.trim().split(' ').filter(Boolean).length < 2) mark('nome', 'Informe nome e sobrenome.');
  if (data.whatsapp.replace(/\D/g, '').length < 10) mark('whatsapp', 'WhatsApp inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) mark('email', 'E-mail inválido.');
  const docLen = data.documento.replace(/\D/g, '').length;
  if (docLen !== 11 && docLen !== 14) mark('documento', 'CPF (11 dígitos) ou CNPJ (14 dígitos).');
  if (!data.cidade.trim()) mark('cidade', 'Informe sua cidade.');
  if (!data.tipoCredito) mark('tipoCredito', 'Escolha o tipo de crédito.');
  if (data.valor < 5000) mark('valor', 'Valor mínimo de R$ 5.000.');
  if (!data.renda) mark('renda', 'Selecione a faixa de renda.');
  if (!form.consent.checked) errors.push('É preciso aceitar a política de privacidade.');
  return errors;
}

let lastLead = null;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const interesse = e.submitter?.dataset.interest === '1';
  const data = {
    nome: form.nome.value,
    whatsapp: form.whatsapp.value,
    email: form.email.value.trim(),
    documento: form.documento.value,
    cidade: form.cidade.value,
    tipoCredito: form.tipoCredito.value,
    valor: unmaskMoney(form.valor.value),
    renda: form.renda.value,
    interesse,
  };
  const errors = validate(data);
  if (errors.length) {
    errorBox.textContent = errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} campo(s) para revisar)` : '');
    form.querySelector('.is-invalid input, .is-invalid select')?.focus();
    return;
  }
  errorBox.textContent = '';
  [...form.querySelectorAll('button')].forEach((b) => (b.disabled = true));

  const sim = simulate(data);
  const { lead, steps, pj } = createLeadFromSimulation(data);
  lastLead = lead;
  renderResult({ sim, lead, steps, pj, interesse });
});

function renderResult({ sim, lead, steps, pj, interesse }) {
  const first = lead.nome.split(' ')[0];
  const best = sim.tipo.kind === 'consorcio' ? sim.opcoes.length - 1 : 1;
  form.hidden = true;
  resultBox.hidden = false;
  resultBox.innerHTML = `
    <div class="result__head">
      <div class="result__badge">✓</div>
      <div>
        <h3>Simulação pronta, ${esc(first)}!</h3>
        <p>${esc(sim.tipo.label)} · ${brl(sim.valor)}</p>
      </div>
    </div>
    <div class="options">
      ${sim.opcoes
        .map(
          (o, i) => `<div class="option ${i === best ? 'is-best' : ''}">
            <span>${o.prazo} meses</span><strong>${brl(o.parcela)}</strong><span>/mês</span></div>`
        )
        .join('')}
    </div>
    <p class="fine">${esc(sim.opcoes[0].detalhe)}. Valores ilustrativos, sujeitos à análise e às condições da administradora.</p>
    ${
      interesse
        ? `<div class="notice notice--ok"><b>Recebemos seu interesse! 🎉</b><br>Um consultor especialista vai falar com você pelo WhatsApp <b>${esc(lead.whatsapp)}</b> em até 1 hora útil.</div>`
        : `<div class="notice notice--info"><b>Simulação enviada para o seu e-mail.</b><br>Quando quiser, nossa assistente virtual tira suas dúvidas — e um especialista pode te atender sem compromisso.</div>`
    }
    <ol class="timeline" id="timeline">
      <li class="timeline__title" style="opacity:1">Nos bastidores (visão da demonstração)</li>
      ${steps.map((s) => `<li><i>✓</i><div><b>${esc(s.label)}</b><span>${esc(s.detail)}</span></div></li>`).join('')}
    </ol>
    <div class="result__actions">
      <button class="btn btn--primary" id="open-bot" type="button">💬 ${interesse ? 'Iniciar pré-atendimento' : 'Tirar dúvidas com a assistente'}</button>
      <a class="btn btn--ghost" href="app.html#/funil?lead=${lead.id}" target="_blank" rel="noopener">Ver lead no CRM ↗</a>
      <button class="btn btn--outline" id="new-sim" type="button">Nova simulação</button>
    </div>`;

  // Animação da linha do tempo
  [...resultBox.querySelectorAll('.timeline li:not(.timeline__title)')].forEach((li, i) => setTimeout(() => li.classList.add('is-done'), 400 + i * 550));

  resultBox.querySelector('#open-bot').addEventListener('click', () => openChat(interesse || lead.interesse ? 'qualificado' : 'frio'));
  resultBox.querySelector('#new-sim').addEventListener('click', () => {
    form.reset();
    [...form.querySelectorAll('button')].forEach((b) => (b.disabled = false));
    form.hidden = false;
    resultBox.hidden = true;
    lastLead = null;
    form.nome.focus();
  });
  document.getElementById('chat-fab').classList.add('has-alert');
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Chat flutuante ----
const fab = document.getElementById('chat-fab');
const panel = document.getElementById('chat-panel');
const chatRoot = document.getElementById('chat-root');
let chat = null;

const hooks = {
  engaged: () => (lastLead ? { lead: (lastLead = chatbotEngaged(lastLead.id)) } : null),
  interest: () => {
    if (!lastLead) return null;
    const res = chatbotInterest(lastLead.id);
    lastLead = res.lead;
    return res;
  },
  transfer: (ctx) => {
    if (!lastLead) return null;
    const a = ctx.answers;
    const res = chatbotTransfer(lastLead.id, `Objetivo: ${a.objetivo}; prazo: ${a.urgencia}; contato por: ${a.canal}.`);
    lastLead = res.lead;
    return res;
  },
};

function openChat(botId) {
  const id = botId || (lastLead?.interesse ? 'qualificado' : 'frio');
  panel.hidden = false;
  fab.hidden = true;
  fab.classList.remove('has-alert');
  chat?.destroy();
  chat = mountChat(chatRoot, { botId: id, lead: lastLead, hooks, compact: true });
}

fab.addEventListener('click', () => openChat());
document.getElementById('chat-close').addEventListener('click', () => {
  panel.hidden = true;
  fab.hidden = false;
  chat?.destroy();
});
