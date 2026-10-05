// Gerenciador de WhatsApp: 10 slots de números (interface demonstrativa).
import { listNumbers, simulateConnect, disconnect, setRole, WA_ROLES } from '../../services/whatsapp.js';
import { openModal, toast, live } from '../components/ui.js';
import { esc, maskPhone, timeAgo } from '../format.js';

export const title = () => 'Gerenciador de WhatsApp';

const WA_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>`;

// QR code "falso" apenas para ilustrar o pareamento
function fakeQR(seed) {
  const n = 25;
  let s = seed * 9973;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let cells = '';
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      if (r() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  const eye = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" fill="#0c1a33" shape-rendering="crispEdges" role="img" aria-label="QR code ilustrativo"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/>${cells}${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</svg>`;
}

export function render(el) {
  const paint = () => {
    const list = listNumbers();
    const on = list.filter((n) => n.status === 'conectado');
    el.innerHTML = `
      <div class="banner"><span class="banner__icon">📱</span><div><b>Interface demonstrativa.</b> Nenhum WhatsApp real é conectado nesta versão. Na integração com a WhatsApp Business API, cada slot receberá um número oficial, o QR/pareamento real e o roteamento para os chatbots e vendedores.</div></div>
      <div class="kpis">
        <div class="card kpi kpi--hero"><span>Números conectados</span><strong>${on.length}/${list.length}</strong><small>capacidade do plano: 10</small></div>
        <div class="card kpi"><span>Mensagens hoje</span><strong>${list.reduce((s, n) => s + (n.mensagensHoje || 0), 0)}</strong><small>simulado</small></div>
        <div class="card kpi"><span>Chatbot 1 (Frio)</span><strong>${list.filter((n) => n.funcao === 'bot-frio' && n.status === 'conectado').length ? 'Ativo' : 'Inativo'}</strong><small>número dedicado</small></div>
        <div class="card kpi"><span>Chatbot 2 (Qualificado)</span><strong>${list.filter((n) => n.funcao === 'bot-qualificado' && n.status === 'conectado').length ? 'Ativo' : 'Inativo'}</strong><small>número dedicado</small></div>
      </div>
      <div class="wa-grid">${list
        .map((n) => {
          const isOn = n.status === 'conectado';
          return `<div class="card wa ${isOn ? '' : 'is-off'}">
            <div class="wa__top"><div class="wa__icon">${WA_ICON}</div>
              <div><b>${esc(n.nome)}</b><small>${esc(n.numero || 'Sem número')}</small></div>
              <span style="margin-left:auto" class="pill ${isOn ? 'pill--ok' : 'pill--off'}"><i></i>${isOn ? 'Conectado' : 'Não conectado'}</span>
            </div>
            <label class="small muted">Função
              <select class="select" data-role="${n.id}" style="width:100%;margin-top:4px">${Object.entries(WA_ROLES)
                .map(([k, v]) => `<option value="${k}" ${n.funcao === k ? 'selected' : ''}>${esc(v)}</option>`)
                .join('')}</select>
            </label>
            <div class="wa__stats"><span>Mensagens hoje <b>${n.mensagensHoje || 0}</b></span><span>${isOn ? `desde ${timeAgo(n.conectadoEm)}` : '—'}</span></div>
            ${isOn ? `<button class="btn btn--danger" data-off="${n.id}" type="button">Desconectar</button>` : `<button class="btn btn--primary" data-on="${n.id}" type="button">Conectar número</button>`}
          </div>`;
        })
        .join('')}</div>`;

    el.querySelectorAll('[data-role]').forEach((s) =>
      s.addEventListener('change', () => {
        setRole(s.dataset.role, s.value);
        toast('Função atualizada', WA_ROLES[s.value], '📱');
      })
    );
    el.querySelectorAll('[data-off]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('Desconectar este número (simulação)?')) return;
        disconnect(b.dataset.off);
        toast('Número desconectado', '', '📴');
      })
    );
    el.querySelectorAll('[data-on]').forEach((b) => b.addEventListener('click', () => connectModal(list.find((n) => n.id === b.dataset.on))));
  };

  return live(paint);
}

function connectModal(slot) {
  const m = openModal({
    title: `Conectar ${slot.nome}`,
    subtitle: 'Pareamento simulado',
    size: 'sm',
    body: `
      <div class="qr">${fakeQR(Number(slot.id.slice(2)) + 7)}</div>
      <ol class="flow" style="margin-bottom:14px">
        <li>Abra o WhatsApp Business no celular</li>
        <li>Toque em <b>Aparelhos conectados</b> › <b>Conectar aparelho</b></li>
        <li>Aponte a câmera para o QR code</li>
      </ol>
      <div class="form-row"><label for="wa-num">Número (para exibição)</label><input id="wa-num" class="input" inputmode="tel" placeholder="(11) 4000-0000" value="${esc(slot.numero || '')}" /></div>
      <p class="small muted" style="margin:0">Na versão final, o QR será gerado pela WhatsApp Business API e a conexão confirmada automaticamente.</p>`,
    footer: '<button class="btn" data-close type="button">Cancelar</button><button class="btn btn--primary" id="wa-ok" type="button">Simular leitura do QR</button>',
  });
  const num = m.el.querySelector('#wa-num');
  num.addEventListener('input', () => (num.value = maskPhone(num.value)));
  m.el.querySelector('[data-close]').addEventListener('click', m.close);
  m.el.querySelector('#wa-ok').addEventListener('click', () => {
    const btn = m.el.querySelector('#wa-ok');
    btn.disabled = true;
    btn.textContent = 'Conectando…';
    setTimeout(() => {
      simulateConnect(slot.id, num.value || `(11) 4000-00${slot.id.slice(2)}`);
      m.close();
      toast(`${slot.nome} conectado`, 'Conexão simulada com sucesso', '✅');
    }, 1100);
  });
}
