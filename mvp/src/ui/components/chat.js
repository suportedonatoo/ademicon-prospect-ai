// Motor de conversa dos chatbots (UI). Lê os fluxos de services/chatbot.js
// e executa as ações (engajou / interesse / transferir) via "hooks" do chamador,
// para funcionar tanto na landing page quanto na plataforma.
import { BOTS, matchFAQ, resolveText } from '../../services/chatbot.js';
import { esc, initials } from '../format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {HTMLElement} root
 * @param {{ botId: 'frio'|'qualificado', lead?: object, hooks?: { engaged?, interest?, transfer? }, compact?: boolean }} opts
 */
export function mountChat(root, { botId, lead = null, hooks = {}, compact = false }) {
  const bot = BOTS[botId];
  const ctx = { lead, answers: {}, pj: null };
  let current = null;
  let busy = false;
  let alive = true;

  root.innerHTML = `
    <div class="chat ${compact ? 'chat--compact' : ''}">
      <div class="chat__head">
        <div class="chat__avatar">V</div>
        <div class="chat__who">
          <strong>${esc(bot.persona)}</strong>
          <span class="chat__status"><i></i>online · respostas automáticas</span>
        </div>
        <button class="chat__restart" type="button" title="Reiniciar conversa" aria-label="Reiniciar conversa">↻</button>
      </div>
      <div class="chat__body" aria-live="polite"></div>
      <div class="chat__quick"></div>
      <form class="chat__input">
        <input type="text" placeholder="Digite uma mensagem…" aria-label="Mensagem" autocomplete="off" />
        <button type="submit" aria-label="Enviar">➤</button>
      </form>
    </div>`;

  const body = root.querySelector('.chat__body');
  const quick = root.querySelector('.chat__quick');
  const form = root.querySelector('.chat__input');
  const input = form.querySelector('input');

  root.querySelector('.chat__restart').addEventListener('click', () => {
    alive = false;
    mountChat(root, { botId, lead: ctx.lead, hooks, compact });
  });

  function scroll() {
    body.scrollTop = body.scrollHeight;
  }

  function bubble(text, who = 'bot', meta = '') {
    const el = document.createElement('div');
    el.className = `msg msg--${who}`;
    el.innerHTML = `${meta ? `<span class="msg__meta">${esc(meta)}</span>` : ''}<div class="msg__text">${esc(text).replace(/\n/g, '<br>')}</div>
      <span class="msg__time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>`;
    body.appendChild(el);
    scroll();
  }

  function system(text) {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = text;
    body.appendChild(el);
    scroll();
  }

  async function botSays(lines) {
    for (const line of lines) {
      if (!alive) return;
      const typing = document.createElement('div');
      typing.className = 'msg msg--bot msg--typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(typing);
      scroll();
      await wait(Math.min(1100, 350 + String(line).length * 8));
      typing.remove();
      if (!alive) return;
      bubble(line);
    }
  }

  function renderOptions(node) {
    quick.innerHTML = '';
    (node.options || []).forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = opt.label;
      b.addEventListener('click', () => choose(opt));
      quick.appendChild(b);
    });
    input.placeholder = node.input?.placeholder || 'Digite uma mensagem…';
  }

  async function go(nodeId) {
    busy = true;
    current = nodeId;
    const node = bot.nodes[nodeId];
    quick.innerHTML = '';
    await botSays(node.say.map((t) => resolveText(t, ctx)));
    if (node.handoff) await handoff();
    busy = false;
    if (!alive) return;
    if (node.end) {
      finish();
      return;
    }
    renderOptions(node);
    if (!compact) input.focus({ preventScroll: true });
  }

  async function runAction(action) {
    const fn = hooks[action];
    if (!fn) return;
    const res = await fn(ctx);
    if (res?.lead) ctx.lead = res.lead;
    if (res?.pj) ctx.pj = res.pj;
    if (action === 'engaged' && res?.lead) system('Lead engajou no chatbot · +20 pontos no score');
    if (action === 'interest' && res?.pj) system(`Lead qualificado e distribuído para ${res.pj.codigo} (Round Robin)`);
  }

  async function choose(opt) {
    if (busy) return;
    busy = true;
    bubble(opt.label, 'user');
    Object.assign(ctx.answers, opt.set || {});
    if (opt.action) await runAction(opt.action);
    busy = false;
    go(opt.next);
  }

  async function handoff() {
    const pj = ctx.pj;
    system(pj ? `Conversa transferida para ${pj.codigo} · ${pj.nome}` : 'Conversa transferida para a equipe de consultores');
    await wait(900);
    if (!alive) return;
    const name = (ctx.lead?.nome || '').split(' ')[0];
    bubble(
      `Oi${name ? ` ${name}` : ''}! Aqui é ${pj ? pj.nome.split(' ')[0] : 'o consultor'}, da Vela. Já recebi o resumo da sua conversa e vou preparar as melhores opções para você. Posso te ligar hoje?`,
      'human',
      pj ? `${pj.nome} · consultor(a)` : 'Consultor'
    );
  }

  function finish() {
    quick.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip--ghost';
    b.textContent = '↻ Reiniciar demonstração';
    b.addEventListener('click', () => root.querySelector('.chat__restart').click());
    quick.appendChild(b);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    bubble(text, 'user');
    const node = bot.nodes[current];

    if (node?.input) {
      if (node.input.field) ctx.answers[node.input.field] = text;
      const faq = matchFAQ(text);
      if (faq) await botSays([faq.answer]);
      else if (!node.input.field) await botSays(['Boa pergunta! Um consultor pode detalhar isso para o seu caso específico.']);
      else await botSays(['Anotado, obrigado! ✍️']);
      go(node.input.next);
      return;
    }

    const t = text.toLowerCase();
    if (botId === 'frio' && /(atendimento|consultor|interesse|quero contratar)/.test(t) && !node?.end) {
      await runAction('engaged');
      await runAction('interest');
      go('interested');
      return;
    }
    const faq = matchFAQ(text);
    busy = true;
    await botSays([faq ? faq.answer : 'Desculpe, ainda estou aprendendo 🙂 Você pode escolher uma das opções abaixo ou perguntar sobre juros, lance, prazo, documentos ou sorteio.']);
    busy = false;
    if (node && !node.end) renderOptions(node);
    else finish();
  });

  go(bot.start);
  return { destroy: () => (alive = false) };
}

export function avatar(nome, color) {
  return `<span class="avatar" style="${color ? `--av:${color}` : ''}">${esc(initials(nome))}</span>`;
}
