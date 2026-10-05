import { beforeAll, describe, expect, it } from 'vitest';
import { RUN, Session, Visitor, loggedIn, uniquePhone } from './_http';

/**
 * CARGA SIMULADA (E2E):
 *  1) Tráfego falso nas landings das PJs — Google Ads (pago), Google orgânico, Meta, Instagram e
 *     direto — com simulações Frias e leads Mornos/Quentes.
 *  2) 20 conversas com o bot pelo WhatsApp (modo MOCK: nada é enviado de verdade): 10 quentes e 10 frias.
 * Todos os dados levam o marcador RUN no nome para serem encontrados depois.
 */

const PJS = ['jundiai-centro', 'jundiai-eloy-chaves', 'campinas-cambui', 'campinas-barao', 'sp-paulista', 'sp-tatuape', 'osasco', 'barueri-alphaville', 'sorocaba', 'itu'];
const PJ_CODE: Record<string, string> = Object.fromEntries(PJS.map((s, i) => [s, `PJ${String(i + 1).padStart(2, '0')}`]));

type Channel = 'GOOGLE_ADS' | 'GOOGLE_ORGANIC' | 'META' | 'INSTAGRAM' | 'LANDING';
const CHANNELS: { channel: Channel; count: number; params: (i: number) => Record<string, string | undefined> }[] = [
  { channel: 'GOOGLE_ADS', count: 30, params: (i) => (i % 2 ? { gclid: `teste-${RUN}-${i}` } : { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search-consorcio' }) },
  { channel: 'GOOGLE_ORGANIC', count: 20, params: (i) => ({ referrer: i % 2 ? 'https://www.google.com.br/' : 'https://www.google.com/search?q=consorcio' }) },
  { channel: 'META', count: 10, params: (i) => ({ fbclid: `fb-${RUN}-${i}` }) },
  { channel: 'INSTAGRAM', count: 5, params: () => ({ referrer: 'https://l.instagram.com/' }) },
  { channel: 'LANDING', count: 15, params: () => ({}) },
];
const PRODUCTS = ['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'IMOVEL'];
// Valores dentro da faixa de cada produto (carta de crédito / parcela mensal)
const CREDIT: Record<string, number> = { IMOVEL: 250000, VEICULO: 90000, MOTO: 25000, SERVICOS: 30000 };
const INSTALLMENT: Record<string, number> = { IMOVEL: 2500, VEICULO: 1500, MOTO: 600, SERVICOS: 800 };

let gestor: Session;
const stats = { visits: 0, simulations: 0, frio: 0, morno: 0, quente: 0, whatsappClicks: 0, waiting: 0, byChannel: {} as Record<string, { visitas: number; leads: number; quentes: number }> };
const created: { name: string; site: string; heat: 'MORNO' | 'QUENTE'; channel: Channel }[] = [];

async function leadCount(qs: string) {
  return (await gestor.call<{ total: number }>(`/api/v1/leads?pageSize=1&${qs}`)).data.total;
}

beforeAll(async () => {
  gestor = await loggedIn('gestor@prospect.demo');
});

describe('Tráfego pago x orgânico nas landings das PJs', () => {
  it('80 visitantes: canal classificado, simulações frias e leads mornos/quentes na PJ certa', async () => {
    const before: Record<string, number> = {};
    for (const c of CHANNELS) before[c.channel] = await leadCount(`source=${c.channel}&landingHeat=ANY`);

    let n = 0;
    for (const c of CHANNELS) {
      stats.byChannel[c.channel] = { visitas: 0, leads: 0, quentes: 0 };
      for (let i = 0; i < c.count; i++, n++) {
        const site = PJS[n % PJS.length];
        const v = new Visitor(site, `100.64.${Math.floor(n / 200)}.${(n % 200) + 1}`);
        const visit = await v.visit(c.params(i));
        expect(visit.status).toBe(200);
        expect([site, c.channel, visit.data.channel]).toEqual([site, c.channel, c.channel]);
        stats.visits++;
        stats.byChannel[c.channel].visitas++;

        if (n % 10 === 5) {
          await v.post('/api/track', { event: 'WHATSAPP_CLICK' });
          stats.whatsappClicks++;
        }
        if (n % 10 >= 7) continue; // 30% só visitam

        const product = PRODUCTS[n % PRODUCTS.length];
        const byInstallment = n % 2 === 0;
        const sim = await v.post<{ simulationId: string; heat: string }>('/api/simulate', byInstallment ? { product, mode: 'PARCELA', installment: INSTALLMENT[product] + (n % 3) * 50 } : { product, mode: 'CREDITO', value: CREDIT[product] + (n % 3) * 5000 });
        expect([product, sim.status, sim.error?.message]).toEqual([product, 200, undefined]);
        expect(sim.data.heat).toBe('FRIO');
        stats.simulations++;

        const heat = n % 10 <= 2 ? 'MORNO' : n % 10 === 3 ? 'QUENTE' : null;
        if (!heat) {
          stats.frio++;
          continue;
        }
        const name = `Trafego ${c.channel} ${n} ${RUN}`;
        const r = await v.post<{ heat: string; protocol: string }>('/api/interest', {
          simulationId: sim.data.simulationId,
          name,
          whatsapp: uniquePhone(n),
          callNow: heat === 'QUENTE',
          consentWhatsapp: true,
        });
        expect([name, r.status, r.data?.heat]).toEqual([name, 200, heat]);
        created.push({ name, site, heat, channel: c.channel });
        stats[heat === 'MORNO' ? 'morno' : 'quente']++;
        stats.byChannel[c.channel].leads++;
        if (heat === 'QUENTE') stats.byChannel[c.channel].quentes++;
      }
    }

    // O sistema de gestão recebeu os leads com a origem correta
    for (const c of CHANNELS) {
      const expected = created.filter((x) => x.channel === c.channel).length;
      expect([c.channel, (await leadCount(`source=${c.channel}&landingHeat=ANY`)) - before[c.channel]]).toEqual([c.channel, expected]);
    }
  }, 600_000);

  it('cada lead ficou na PJ dona do link, com a temperatura da landing e um consultor', async () => {
    for (const x of created) {
      const list = await gestor.call<{ items: { id: string; pj: { code: string } | null; landingHeat: string; consultantId: string | null }[] }>(`/api/v1/leads?q=${encodeURIComponent(x.name)}`);
      expect(list.data.items).toHaveLength(1);
      const lead = await gestor.call<{ pj: { id: string; code: string } | null; landingHeat: string; temperature: string; consultant: { pjId: string } | null }>(`/api/v1/leads/${list.data.items[0].id}`);
      expect([x.name, lead.data.landingHeat]).toEqual([x.name, x.heat]);
      expect([x.name, lead.data.pj?.code]).toEqual([x.name, PJ_CODE[x.site]]);
      if (lead.data.consultant) {
        expect([x.name, lead.data.consultant.pjId]).toEqual([x.name, lead.data.pj?.id]); // consultor da própria PJ
      } else {
        // Sem consultor disponível na PJ (capacidade/indisponível): fica na PJ aguardando o gestor — nunca vai para outra PJ.
        const decisions = await gestor.call<{ outcome: string }[]>(`/api/v1/routing/decisions?leadId=${list.data.items[0].id}`);
        expect([x.name, decisions.data[0]?.outcome]).toEqual([x.name, 'NO_ELIGIBLE']);
        stats.waiting++;
      }
      if (x.heat === 'QUENTE') expect(lead.data.temperature).toBe('QUENTE');
    }
  });
});

// ─────────────────────────────── 20 conversas com o bot ───────────────────────────────

type Conv = {
  id: string;
  mode: string;
  messages: { senderType: string; content: string; direction: string }[];
  lead: { id: string; temperature: string; optOut: boolean; consultantId: string | null; intent: string | null; score: number };
};

const HOT: { name: string; msgs: string[]; expectHandoff: boolean }[] = [
  { name: 'Quente 01 apto Jundiaí', msgs: ['Oi, quero comprar um apartamento de 400 mil em Jundiaí', 'Como funciona o lance?', 'Quero falar com um consultor'], expectHandoff: true },
  { name: 'Quente 02 carro Campinas', msgs: ['Boa tarde! Preciso trocar de carro, uns 90 mil, moro em Campinas', 'preciso urgente, esse mês', 'pode me ligar hoje?'], expectHandoff: true },
  { name: 'Quente 03 casa própria', msgs: ['Quero sair do aluguel e ter minha casa própria, uns 350 mil', 'Estou em Osasco', 'quero um consultor'], expectHandoff: true },
  { name: 'Quente 04 moto', msgs: ['quero uma moto de 25 mil', 'moro em Sorocaba', 'Quero falar com um atendente'], expectHandoff: true },
  { name: 'Quente 05 terreno', msgs: ['Tenho interesse em consórcio de imóvel para comprar um terreno de 200 mil', 'Sou de Itu', 'como faço para contratar?', 'quero falar com um especialista'], expectHandoff: true },
  { name: 'Quente 06 reforma', msgs: ['Quero reformar minha casa, uns 120 mil', 'em Barueri', 'me liga'], expectHandoff: true },
  { name: 'Quente 07 caminhão', msgs: ['Preciso de um caminhão para trabalhar, uns 300 mil', 'tenho o lance', 'quero conversar com um consultor'], expectHandoff: true },
  { name: 'Quente 08 decidido', msgs: ['Já decidi, quero fechar um consórcio de carro de 80 mil', 'Moro em São Paulo'], expectHandoff: false },
  { name: 'Quente 09 urgente', msgs: ['Quero comprar um apartamento de 500 mil, preciso logo', 'estou em Campinas', 'quanto tempo demora a contemplação?'], expectHandoff: false },
  { name: 'Quente 10 viagem', msgs: ['Quero fazer uma viagem de 30 mil com consórcio de serviços', 'tenho interesse', 'quero simular', 'quero falar com um consultor'], expectHandoff: true },
];

const COLD: { name: string; msgs: string[]; check?: (c: Conv) => void }[] = [
  { name: 'Frio 01 só oi', msgs: ['oi'] },
  { name: 'Frio 02 pesquisando', msgs: ['só estou pesquisando, obrigado'] },
  { name: 'Frio 03 pede garantia', msgs: ['vocês garantem que eu vou ser contemplado no primeiro mês?'] },
  { name: 'Frio 04 pergunta taxa', msgs: ['qual a taxa de juros de vocês?'] },
  { name: 'Frio 05 fora da base', msgs: ['qual o horário de funcionamento da loja no domingo?'], check: (c) => expect(aiText(c)).not.toMatch(/\b\d{1,2}\s?(h|hs|horas)\b/i) },
  {
    name: 'Frio 06 opt-out',
    msgs: ['oi', 'PARAR', 'oi?'],
    check: (c) => {
      expect(c.lead.optOut).toBe(true);
      expect(c.messages.at(-1)?.senderType).toBe('LEAD'); // depois do opt-out a IA não responde
    },
  },
  { name: 'Frio 07 sem interesse', msgs: ['não tenho interesse'] },
  {
    name: 'Frio 08 é robô',
    msgs: ['você é um robô?'],
    check: (c) => {
      expect(aiText(c)).toMatch(/sou um assistente virtual/i); // responde a pergunta com a verdade
      expect(aiText(c)).not.toMatch(/não tenho uma informação confirmada/i);
    },
  },
  { name: 'Frio 09 preço sem dados', msgs: ['me manda o preço do consórcio de moto'], check: (c) => expect(aiText(c)).not.toMatch(/R\$\s?\d/) },
  { name: 'Frio 10 vou pensar', msgs: ['boa tarde', 'vou pensar'] },
];

const aiText = (c: Conv) =>
  c.messages
    .filter((m) => m.senderType === 'AI')
    .map((m) => m.content)
    .join('\n');

async function talk(from: string, name: string, msgs: string[]) {
  const wa = new Session('192.0.2.10');
  let conversationId = '';
  for (const [i, text] of msgs.entries()) {
    const r = await wa.call<{ ok: boolean; conversationId: string }>('/api/v1/webhooks/inbound/whatsapp?org=demo', { body: { from, text, profileName: name, externalId: `${RUN}-${from}-${i}` } });
    expect([name, i, r.status]).toEqual([name, i, 200]);
    conversationId = r.data.conversationId;
  }
  return (await gestor.call<Conv>(`/api/v1/conversations/${conversationId}`)).data;
}

/** Regras que valem para TODAS as conversas (ética da IA). */
function commonChecks(name: string, c: Conv) {
  const ai = c.messages.filter((m) => m.senderType === 'AI');
  expect([name, ai.length > 0]).toEqual([name, true]);
  expect([name, /assistente virtual|automatizad/i.test(ai[0].content)]).toEqual([name, true]); // se identifica
  const all = aiText(c);
  expect([name, /\bsou (um |uma )?(humano|humana|pessoa real)\b|n[aã]o sou (um |uma )?(rob[oô]|bot)/i.test(all)]).toEqual([name, false]); // não finge ser humano
  expect([name, /(aprova[cç][aã]o|contempla[cç][aã]o) (é |est[aá] |fica |ser[aá] )?garantida|garantimos|com certeza (vai|ser[aá]) contemplad/i.test(all)]).toEqual([name, false]); // sem promessas
  expect([name, /\d+(?:[.,]\d+)?\s?%/.test(all)]).toEqual([name, false]); // sem taxas inventadas
  expect([name, /\((Dr|Dra|Sr|Sra|Prof)\.?\)/.test(all)]).toEqual([name, false]); // nome do consultor sem título solto
}

const report: { conversa: string; tipo: string; msgs_ia: number; modo: string; temperatura: string; score: number; consultor: string }[] = [];

describe('20 conversas com o bot (WhatsApp, modo mock)', () => {
  it('10 conversas quentes: coleta dados, responde com a base e transfere para consultor', async () => {
    for (const [i, h] of HOT.entries()) {
      const c = await talk(`5511970${String(Date.now() % 10000).padStart(4, '0')}${String(i).padStart(2, '0')}`, `${h.name} ${RUN}`, h.msgs);
      commonChecks(h.name, c);
      expect([h.name, ['MORNO', 'QUENTE'].includes(c.lead.temperature)]).toEqual([h.name, true]);
      if (h.expectHandoff) {
        expect([h.name, c.mode]).toEqual([h.name, 'HUMAN']);
        if (!c.lead.consultantId) {
          // Sem consultor elegível (capacidade/especialidade): aguarda distribuição manual — precisa estar registrado.
          const d = await gestor.call<{ outcome: string }[]>(`/api/v1/routing/decisions?leadId=${c.lead.id}`);
          expect([h.name, d.data[0]?.outcome]).toEqual([h.name, 'NO_ELIGIBLE']);
        }
      }
      report.push({ conversa: h.name, tipo: 'quente', msgs_ia: c.messages.filter((m) => m.senderType === 'AI').length, modo: c.mode, temperatura: c.lead.temperature, score: c.lead.score, consultor: c.lead.consultantId ? 'sim' : 'não' });
    }
  }, 600_000);

  it('10 conversas frias: sem promessas, sem números inventados, respeita opt-out', async () => {
    for (const [i, f] of COLD.entries()) {
      const c = await talk(`5511971${String(Date.now() % 10000).padStart(4, '0')}${String(i).padStart(2, '0')}`, `${f.name} ${RUN}`, f.msgs);
      commonChecks(f.name, c);
      expect([f.name, c.lead.temperature]).toEqual([f.name, 'FRIO']);
      expect([f.name, c.mode]).toEqual([f.name, 'AI']); // frio continua com a IA (nutrição)
      f.check?.(c);
      report.push({ conversa: f.name, tipo: 'frio', msgs_ia: c.messages.filter((m) => m.senderType === 'AI').length, modo: c.mode, temperatura: c.lead.temperature, score: c.lead.score, consultor: c.lead.consultantId ? 'sim' : 'não' });
    }
  }, 600_000);

  it('relatório', () => {
    console.log('\n=== TRÁFEGO SIMULADO ===');
    console.table(stats.byChannel);
    console.log({ visitas: stats.visits, simulacoes: stats.simulations, frios: stats.frio, mornos: stats.morno, quentes: stats.quente, cliquesWhatsApp: stats.whatsappClicks, aguardandoConsultor: stats.waiting });
    console.log('\n=== CONVERSAS COM O BOT ===');
    console.table(report);
    expect(report).toHaveLength(20);
  });
});
