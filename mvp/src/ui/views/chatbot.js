// Chatbots demonstrativos: escolha o bot, vincule um lead (opcional) e converse.
import { listLeads, getLead, chatbotEngaged, chatbotInterest, chatbotTransfer } from '../../services/leads.js';
import { peekNextPJ } from '../../services/distribution.js';
import { BOTS } from '../../services/chatbot.js';
import { mountChat } from '../components/chat.js';
import { toast } from '../components/ui.js';
import { esc } from '../format.js';

export const title = () => 'Chatbots';

const FLOW_STEPS = {
  frio: ['Cumprimenta pelo nome e retoma a simulação feita', 'Explica como funciona a simulação', 'Tira dúvidas (juros, lance, prazo, documentos, sorteio…)', 'Faz perguntas de qualificação (prazo e entrada/lance)', 'Incentiva o interesse → se aceitar, qualifica e distribui para um PJ'],
  qualificado: ['Reconhece que o lead já demonstrou interesse', 'Confirma WhatsApp e cidade', 'Entende objetivo, urgência e canal preferido', 'Resume a conversa e informa que um consultor continuará', 'Transfere para atendimento humano (lead vai para “Em atendimento”)'],
};

const ELIGIBLE = {
  frio: (l) => ['novo', 'frio', 'qualificacao'].includes(l.status),
  qualificado: (l) => ['qualificado', 'distribuido'].includes(l.status),
};

export function render(el, { user, params }) {
  const preset = params.lead ? getLead(params.lead) : null;
  let botId = preset ? (preset.interesse ? 'qualificado' : 'frio') : 'frio';
  let leadId = preset?.id || '';
  let chat = null;

  el.innerHTML = `
    <div class="bot-layout">
      <div class="grid" style="gap:16px">
        <div class="bot-tabs">${Object.values(BOTS)
          .map((b) => `<button class="bot-tab" data-bot="${b.id}" type="button"><b>${esc(b.nome)}</b><span>${esc(b.objetivo)}</span></button>`)
          .join('')}</div>
        <div class="card">
          <div class="card__head"><div><h3>Vincular a um lead</h3><p>Com um lead vinculado, as respostas atualizam o CRM de verdade (score, etapa e distribuição).</p></div></div>
          <div class="card__body">
            <select class="select" id="lead-sel" style="width:100%" aria-label="Lead vinculado"></select>
          </div>
        </div>
        <div class="card">
          <div class="card__head"><div><h3>Roteiro do bot</h3><p id="bot-goal"></p></div></div>
          <div class="card__body"><ol class="flow" id="flow"></ol></div>
        </div>
        <div class="banner"><span class="banner__icon">🧠</span><div><b>Respostas pré-configuradas nesta versão.</b> Os roteiros ficam em <code>src/services/chatbot.js</code> como dados. Na próxima fase, o mesmo motor pode usar IA real e rodar no WhatsApp Business API.</div></div>
      </div>
      <div class="phone" id="phone"></div>
    </div>`;

  const sel = el.querySelector('#lead-sel');
  const phone = el.querySelector('#phone');

  const scope = () => listLeads(user.role === 'pj' ? { pjId: user.id } : {});

  const fillLeads = () => {
    const eligible = scope().filter(ELIGIBLE[botId]);
    const current = leadId ? getLead(leadId) : null;
    if (current && !eligible.some((l) => l.id === current.id)) eligible.unshift(current);
    sel.innerHTML =
      `<option value="">Visitante de demonstração (não altera o CRM)</option>` +
      eligible.map((l) => `<option value="${l.id}" ${l.id === leadId ? 'selected' : ''}>${l.id} · ${esc(l.nome)} (score ${l.score})</option>`).join('');
  };

  const hooks = {
    engaged: () => (leadId ? { lead: chatbotEngaged(leadId) } : null),
    interest: () => {
      if (!leadId) return null;
      const res = chatbotInterest(leadId);
      toast('Lead qualificado pelo chatbot', `${res.lead.nome} → ${res.pj.codigo}`, '🤖');
      return res;
    },
    transfer: (ctx) => {
      if (!leadId) return { pj: peekNextPJ() };
      const a = ctx.answers;
      const res = chatbotTransfer(leadId, `Objetivo: ${a.objetivo}; prazo: ${a.urgencia}; contato por: ${a.canal}.`);
      toast('Transferido para atendimento humano', `${res.lead.nome} → ${res.pj.codigo} · Em atendimento`, '👤');
      return res;
    },
  };

  const start = () => {
    el.querySelectorAll('.bot-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.bot === botId));
    el.querySelector('#bot-goal').textContent = BOTS[botId].objetivo;
    el.querySelector('#flow').innerHTML = FLOW_STEPS[botId].map((s) => `<li>${esc(s)}</li>`).join('');
    fillLeads();
    chat?.destroy();
    chat = mountChat(phone, { botId, lead: leadId ? getLead(leadId) : null, hooks });
  };

  el.querySelectorAll('.bot-tab').forEach((t) =>
    t.addEventListener('click', () => {
      botId = t.dataset.bot;
      leadId = '';
      start();
    })
  );
  sel.addEventListener('change', () => {
    leadId = sel.value;
    start();
  });

  start();
  return () => chat?.destroy();
}
