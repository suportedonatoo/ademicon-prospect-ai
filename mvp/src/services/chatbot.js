// Chatbots demonstrativos com respostas pré-configuradas.
// Cada fluxo é apenas DADOS (nós com mensagens, opções e ações), então pode
// ser editado sem mexer no motor — e no futuro trocado por IA (src/integrations/ai.js).
import { creditTypeById } from '../data/catalog.js';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const first = (ctx) => (ctx.lead?.nome || '').split(' ')[0];
const hi = (ctx) => (first(ctx) ? `Olá, ${first(ctx)}!` : 'Olá!');
const tipo = (ctx) => creditTypeById(ctx.lead?.tipoCredito).label;

// Perguntas frequentes reconhecidas por palavra-chave (texto livre)
export const FAQ = [
  { keys: ['diferen', 'financiamento'], answer: 'No consórcio você não paga juros: há uma taxa de administração diluída nas parcelas e o crédito sai por sorteio ou lance. No crédito com garantia o dinheiro sai logo após a aprovação, com juros mensais mais baixos que um empréstimo comum.' },
  { keys: ['juros', 'taxa'], answer: 'Consórcio não tem juros, apenas taxa de administração (entre 16% e 20% no prazo total). No crédito com garantia as taxas começam em 1,19% ao mês. Os valores da simulação são ilustrativos.' },
  { keys: ['lance'], answer: 'Lance é uma oferta antecipada de parcelas para ser contemplado mais rápido. Pode ser com recursos próprios ou até com parte da própria carta (lance embutido).' },
  { keys: ['contempla', 'sorteio'], answer: 'Todo mês há assembleia com sorteio e lances. Quem é contemplado recebe a carta de crédito para usar no bem escolhido.' },
  { keys: ['document'], answer: 'Para começar basta RG/CNH, CPF (ou CNPJ), comprovante de renda e de residência. O consultor confirma o que mais for necessário para o seu caso.' },
  { keys: ['prazo', 'meses', 'parcela'], answer: 'Os prazos variam por produto: veículos de 50 a 80 meses, imóveis até 200 meses e crédito com garantia até 180 meses.' },
  { keys: ['seguro', 'confi', 'golpe'], answer: 'Operamos apenas com administradoras autorizadas pelo Banco Central. Nunca pedimos pagamento antecipado para liberar crédito.' },
];

export function matchFAQ(text) {
  const t = text.toLowerCase();
  return FAQ.find((f) => f.keys.some((k) => t.includes(k)));
}

export const BOTS = {
  frio: {
    id: 'frio',
    nome: 'Chatbot 1 — Lead Frio',
    persona: 'Vela · Assistente virtual',
    objetivo: 'Nutrir quem só simulou: explicar, tirar dúvidas, qualificar e incentivar o interesse.',
    start: 'hello',
    nodes: {
      hello: {
        say: [
          (c) => `${hi(c)} 👋 Sou a Vela, assistente virtual da Vela Crédito & Consórcio.`,
          (c) => (c.lead ? `Vi que você simulou ${tipo(c)} de ${brl(c.lead.valor)}. Posso te ajudar a entender melhor?` : 'Posso te ajudar a entender como funciona a simulação?'),
        ],
        options: [
          { label: 'Como funciona a simulação?', next: 'howSim' },
          { label: 'Consórcio x financiamento', next: 'faqDiff' },
          { label: 'Tenho outra dúvida', next: 'freeQuestion' },
        ],
      },
      howSim: {
        say: [
          'É simples: você informa o tipo de crédito e o valor, e mostramos uma estimativa de parcela em alguns prazos.',
          'A simulação é gratuita e sem compromisso. Se fizer sentido, um consultor monta uma proposta com as condições reais.',
        ],
        options: [
          { label: 'Entendi! E agora?', next: 'q1' },
          { label: 'Consórcio x financiamento', next: 'faqDiff' },
        ],
      },
      faqDiff: {
        say: [FAQ[0].answer],
        options: [
          { label: 'Faz sentido, continuar', next: 'q1' },
          { label: 'Tenho outra dúvida', next: 'freeQuestion' },
        ],
      },
      freeQuestion: {
        say: ['Pode escrever sua dúvida aqui embaixo 👇 (ex.: juros, lance, prazo, documentos, sorteio).'],
        input: { placeholder: 'Digite sua dúvida…', next: 'afterFree' },
      },
      afterFree: {
        say: ['Espero ter ajudado! Posso te fazer 2 perguntinhas rápidas para indicar a melhor opção?'],
        options: [
          { label: 'Pode perguntar', next: 'q1' },
          { label: 'Tenho outra dúvida', next: 'freeQuestion' },
        ],
      },
      q1: {
        say: ['Para quando você pretende usar o crédito?'],
        options: [
          { label: 'Nos próximos 3 meses', next: 'q2', set: { prazoUso: 'Até 3 meses' } },
          { label: 'Em até 1 ano', next: 'q2', set: { prazoUso: 'Até 1 ano' } },
          { label: 'Só estou pesquisando', next: 'q2', set: { prazoUso: 'Pesquisando' } },
        ],
      },
      q2: {
        say: ['E você já tem algum valor para entrada ou lance?'],
        options: [
          { label: 'Sim, tenho', next: 'pitch', set: { lance: 'Sim' }, action: 'engaged' },
          { label: 'Ainda não', next: 'pitch', set: { lance: 'Não' }, action: 'engaged' },
        ],
      },
      pitch: {
        say: [
          (c) => (c.answers.prazoUso === 'Pesquisando' ? 'Ótimo momento para pesquisar! Condições de grupo e taxa mudam bastante e um consultor pode comparar as opções para você.' : 'Pelo seu perfil, dá para montar uma proposta bem alinhada ao seu prazo. 🚀'),
          'Quer que um consultor especialista entre em contato pelo WhatsApp, sem compromisso?',
        ],
        options: [
          { label: 'Sim, quero atendimento', next: 'interested', action: 'interest' },
          { label: 'Agora não, obrigado', next: 'nurture' },
        ],
      },
      interested: {
        say: [
          (c) => (c.pj ? `Perfeito! Seu atendimento foi direcionado para ${c.pj.nome} (${c.pj.codigo}).` : 'Perfeito! Um consultor vai entrar em contato em breve.'),
          'Você receberá uma mensagem no WhatsApp em até 1 hora útil. Obrigada! 💙',
        ],
        end: true,
      },
      nurture: {
        say: ['Sem problemas! Vou te enviar alguns conteúdos úteis. Quando quiser, é só responder "quero atendimento". 😉'],
        options: [{ label: 'Quero atendimento', next: 'interested', action: 'interest' }],
      },
    },
  },

  qualificado: {
    id: 'qualificado',
    nome: 'Chatbot 2 — Lead Qualificado',
    persona: 'Vela · Pré-atendimento',
    objetivo: 'Confirmar dados, entender a necessidade e transferir para o consultor humano.',
    start: 'hello',
    nodes: {
      hello: {
        say: [
          (c) => `${hi(c)} Recebemos seu interesse em ${c.lead ? tipo(c) : 'crédito'} e vou agilizar seu atendimento. ✅`,
          (c) => `Só para confirmar: seu WhatsApp é ${c.lead?.whatsapp || '(11) 9XXXX-XXXX'}?`,
        ],
        options: [
          { label: 'Sim, está correto', next: 'city' },
          { label: 'Não, quero corrigir', next: 'fixPhone' },
        ],
      },
      fixPhone: {
        say: ['Sem problemas, qual o número correto?'],
        input: { placeholder: '(00) 00000-0000', field: 'whatsappCorrigido', next: 'city' },
      },
      city: {
        say: [(c) => `E você está em ${c.lead?.cidade || 'sua cidade atual'}, certo?`],
        options: [
          { label: 'Sim', next: 'goal' },
          { label: 'Mudei de cidade', next: 'goal', set: { cidade: 'Cliente informou mudança' } },
        ],
      },
      goal: {
        say: ['Qual o principal objetivo com esse crédito?'],
        options: [
          { label: 'Comprar imóvel', next: 'when', set: { objetivo: 'Comprar imóvel' } },
          { label: 'Comprar veículo', next: 'when', set: { objetivo: 'Comprar veículo' } },
          { label: 'Investir no negócio', next: 'when', set: { objetivo: 'Investir no negócio' } },
          { label: 'Organizar dívidas', next: 'when', set: { objetivo: 'Organizar dívidas' } },
        ],
      },
      when: {
        say: ['E em quanto tempo você precisa?'],
        options: [
          { label: 'Urgente (até 30 dias)', next: 'contact', set: { urgencia: 'Até 30 dias' } },
          { label: 'Até 6 meses', next: 'contact', set: { urgencia: 'Até 6 meses' } },
          { label: 'Sem pressa', next: 'contact', set: { urgencia: 'Sem pressa' } },
        ],
      },
      contact: {
        say: ['Última pergunta: como prefere ser atendido?'],
        options: [
          { label: 'WhatsApp', next: 'summary', set: { canal: 'WhatsApp' } },
          { label: 'Ligação', next: 'summary', set: { canal: 'Ligação' } },
          { label: 'E-mail', next: 'summary', set: { canal: 'E-mail' } },
        ],
      },
      summary: {
        say: [
          (c) =>
            `Anotei tudo:\n• Objetivo: ${c.answers.objetivo}\n• Prazo: ${c.answers.urgencia}\n• Contato por: ${c.answers.canal}${c.lead ? `\n• Valor: ${brl(c.lead.valor)}` : ''}`,
          'Vou transferir você agora para um consultor especialista, que dará continuidade. Um instante…',
        ],
        options: [{ label: 'Ok, aguardo', next: 'handoff', action: 'transfer' }],
      },
      handoff: {
        say: [],
        handoff: true,
        end: true,
      },
    },
  },
};

export function resolveText(text, ctx) {
  return typeof text === 'function' ? text(ctx) : text;
}
