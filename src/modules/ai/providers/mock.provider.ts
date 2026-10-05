import { brl } from '@/lib/format';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { asksIfBot, detectIntent, extractSlots, isOptOut, isQuestion, wantsHuman } from '../nlu';
import type { AgentTurnInput, AgentTurnOutput, AIProvider, KnowledgeSnippet, SummaryInput } from './types';
import { firstName } from '@/lib/normalize';

// MockAIProvider — sem LLM. Conversa natural baseada em regras + Knowledge Base.
// Nunca inventa números: respostas factuais vêm SOMENTE de trechos da Knowledge Base.

// Artigo correto por produto ("a moto", "o imóvel", "os serviços"…).
const PRODUCT_ARTICLE: Record<string, string> = { IMOVEL: 'o', VEICULO: 'o', MOTO: 'a', SERVICOS: 'os', BENS_MOVEIS: 'os' };

const SLOT_QUESTIONS: Record<string, (i: AgentTurnInput) => string> = {
  product: () => 'Para eu te orientar melhor: você está pensando em imóvel, veículo, moto, serviços ou outro bem?',
  objective: (i) => `E qual é o seu objetivo com ${i.lead.product ? `${PRODUCT_ARTICLE[i.lead.product] ?? 'o'} ${productLabel(i.lead.product).toLowerCase()}` : 'esse crédito'}? Por exemplo: comprar, construir, reformar, trocar ou investir.`,
  value: () => 'Você já tem uma ideia do valor do bem ou da carta de crédito que procura?',
  city: () => 'Em qual cidade (ou país) você está hoje? Atendemos online, no Brasil e no exterior.',
  term: () => 'Para quando você imagina usar esse crédito: nos próximos meses ou é um plano de prazo mais longo?',
  preferredChannel: () => 'Por onde prefere que o consultor continue com você: WhatsApp, ligação ou e-mail?',
};

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'é', 'um', 'uma', 'que', 'como', 'para', 'por', 'com', 'no', 'na', 'em', 'os', 'as', 'se', 'eu', 'meu', 'minha', 'qual', 'quais', 'quanto', 'tem', 'ter', 'pode', 'posso', 'funciona', 'sobre']);

/**
 * Frases que NÃO são para o cliente: orientação ao atendente/IA ("Explique…", "Entenda o objetivo…",
 * "Respeite o tempo do cliente…") e avisos internos ("Conteúdo genérico de demonstração…").
 * O roteiro mostra o texto da Knowledge Base ao cliente, então essas frases ficam de fora.
 */
const INTERNAL_SENTENCE =
  /^(explique|oriente|mostre|entenda|explore|respeite|ofere[çc]a|seja |sempre que|transfira|n[ãa]o critique|nunca invente|use a simula|colete|interrompa|registre|combine|evite|pergunte ao cliente)|\bo cliente\b|\bao cliente\b|conte[úu]do gen[ée]rico de demonstra|substituir por material oficial/i;
export const isCustomerFacing = (sentence: string) => !INTERNAL_SENTENCE.test(sentence.trim());

function bestSentences(snippet: KnowledgeSnippet, query: string, max = 2): string {
  const words = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/).filter((w) => w.length > 2 && !STOP.has(w));
  const sentences = snippet.content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 20 && isCustomerFacing(s));
  const scored = sentences.map((s, idx) => {
    const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return { s, idx, hits: words.filter((w) => n.includes(w)).length };
  });
  const best = [...scored].sort((a, b) => b.hits - a.hits || a.idx - b.idx)[0];
  if (!best) return '';
  // Frases que dependem da anterior ("Ela…", "Isso…") levam o contexto junto.
  const dependsOnPrevious = /^(ela|ele|elas|eles|isso|esse|essa|este|esta|nele|nela)\b/i.test(best.s) && best.idx > 0;
  const start = dependsOnPrevious ? best.idx - 1 : best.idx;
  return sentences.slice(start, start + max).join(' ');
}

function acknowledge(e: ReturnType<typeof extractSlots>): string | null {
  const parts: string[] = [];
  if (e.product) parts.push(productLabel(e.product).toLowerCase());
  if (e.value) parts.push(`em torno de ${brl(e.value)}`);
  if (e.city) parts.push(`em ${e.city}`);
  if (e.term) parts.push(`com prazo ${e.term.toLowerCase()}`);
  if (!parts.length) return null;
  return `Anotado: ${parts.join(', ')}.`;
}

/** Só um cumprimento ("oi", "bom dia!", "olá, tudo bem?") — sem pergunta nem dado. */
const GREETING = /^(oi+|ol[aá]+|opa|e a[ií]|hey|bom dia|boa tarde|boa noite)([\s,!.?]*(tudo bem|tudo bom|td bem|como vai)?)?[\s!.?]*$/i;

export class MockAIProvider implements AIProvider {
  name = 'mock' as const;
  model = 'mock-rules-v1';

  async healthCheck() {
    return { ok: true, mode: 'mock' as const, detail: 'Respostas por regras + Knowledge Base (sem LLM). Configure AI_PROVIDER=anthropic para IA real.' };
  }

  async generateTurn(i: AgentTurnInput): Promise<AgentTurnOutput> {
    const text = i.userMessage ?? '';
    const extracted = text ? extractSlots(text) : {};
    const intent = text ? detectIntent(text) : 'LOW';
    const human = text ? wantsHuman(text) : false;
    const optOut = text ? isOptOut(text) : false;
    const greeting = !!text && GREETING.test(text.trim());
    const question = text && !greeting ? isQuestion(text) : false;
    const emoji = (e: string) => (i.personality.emojis ? ` ${e}` : '');
    const first = firstName(i.lead.name);
    const parts: string[] = [];
    const used: string[] = [];
    let gap = false;

    if (optOut) {
      return {
        reply: 'Entendido. Não enviaremos mais mensagens por aqui. Se mudar de ideia, é só nos chamar. Obrigado pelo seu tempo.',
        extracted,
        intent: 'LOW',
        wantsHuman: false,
        optOut: true,
        isQuestion: false,
        knowledgeGap: false,
        usedKnowledgeIds: [],
      };
    }

    // Slots que continuam faltando depois desta mensagem.
    const missing = i.missingSlots.filter((s) => !(extracted as Record<string, unknown>)[s]);

    if (i.isFirstTurn && !text) {
      if (i.agentKey === 'QUALIFICATION') {
        parts.push(`Olá${first ? `, ${first}` : ''}! Recebemos seu pedido de contato${i.lead.product ? ` sobre ${productLabel(i.lead.product).toLowerCase()}` : ''}.${emoji('🙂')}`);
        parts.push(i.disclosure);
        parts.push('Vou só completar algumas informações para o consultor já chegar preparado.');
      } else {
        parts.push(`Olá${first ? `, ${first}` : ''}! Tudo bem?${emoji('👋')}`);
        parts.push(i.disclosure);
        parts.push(i.lead.product ? `Vi seu interesse em ${productLabel(i.lead.product).toLowerCase()}. Posso te ajudar a entender como funciona e tirar suas dúvidas.` : 'Posso te ajudar a entender como funciona o consórcio e tirar suas dúvidas.');
      }
    } else {
      if (i.isFirstTurn) {
        parts.push(`Olá${first ? `, ${first}` : ''}!${emoji('👋')}`);
        parts.push(i.disclosure);
      }
      const ack = acknowledge(extracted);
      if (ack) parts.push(ack);

      if (greeting) {
        if (!i.isFirstTurn) parts.push(`Olá${first ? `, ${first}` : ''}! Tudo bem?${emoji('👋')}`);
        parts.push('Posso te ajudar a entender como funciona o consórcio ou a simular um plano. O que você gostaria de saber?');
      } else if (text && asksIfBot(text)) {
        // Transparência: nunca fingir ser humano — responde a pergunta diretamente.
        parts.push(i.isFirstTurn ? 'Isso mesmo: sou um assistente virtual, um atendimento automatizado.' : 'Sim, sou um assistente virtual, um atendimento automatizado.');
        parts.push('Se preferir falar com uma pessoa, é só escrever "quero um consultor".');
      } else if (question || extracted.objections?.length) {
        // Políticas e regras de atendimento orientam o agente; não são texto de resposta ao cliente.
        // Usa o primeiro trecho relevante que tenha alguma frase escrita PARA o cliente.
        const answer = i.knowledge
          .filter((k) => k.category !== 'POLITICAS' && k.category !== 'ATENDIMENTO' && k.score >= i.minRelevance)
          .map((k) => ({ k, text: bestSentences(k, text) }))
          .find((a) => a.text);
        const top = answer?.k;
        if (top && answer) {
          parts.push(answer.text);
          used.push(top.chunkId);
        } else if (question) {
          gap = true;
          parts.push('Boa pergunta. Não tenho uma informação confirmada para te passar agora, e prefiro não arriscar. Vou registrar para um consultor te responder com precisão.');
        }
      }

      if (human) parts.push('Claro! Vou chamar um consultor para continuar com você.');
    }

    // Nunca repetir a MESMA pergunta da mensagem anterior: se o cliente respondeu outra coisa,
    // segue para o próximo dado que falta (a pergunta pendente volta mais tarde, se ainda faltar).
    const lastBot = [...i.history].reverse().find((h) => h.role === 'assistant')?.content ?? '';
    const nextSlot = missing.find((s) => {
      const q = SLOT_QUESTIONS[s]?.(i);
      return q && !lastBot.includes(q);
    });

    // O cliente já informou o que quer? (produto ou valor, nesta mensagem ou antes)
    const knowsSomething = !!(i.lead.product || i.lead.value || extracted.product || extracted.value);

    if (greeting) {
      // cumprimento já respondido acima — não emenda pergunta de dado nem convite
    } else if (!human) {
      if (nextSlot) {
        parts.push(SLOT_QUESTIONS[nextSlot]?.(i) ?? '');
      } else if (missing.length && i.agentKey !== 'PROSPECT') {
        parts.push('Sem problema. Com o que você já me contou, um consultor consegue te orientar e confirmar os detalhes com você.');
      } else if (i.agentKey === 'PROSPECT' && !knowsSomething) {
        parts.push('Qual bem você tem em mente: imóvel, veículo, moto ou serviços?');
      } else if (i.agentKey === 'PROSPECT') {
        parts.push('Com essas informações já dá para montar uma simulação personalizada. Quer que um consultor especialista prepare isso para você, sem compromisso?');
      } else {
        parts.push('Perfeito, já tenho o que preciso. Vou passar seu atendimento para um consultor, que vai continuar a partir daqui.');
      }
    }

    let reply = parts.filter(Boolean).join(' ');
    if (reply.length > 900) reply = reply.slice(0, 897) + '…';
    const acceptedHelp = /^(sim|pode|quero|claro|ok|bora|vamos|pode sim|quero sim)\b/i.test(text.trim()) && i.agentKey === 'PROSPECT' && !i.missingSlots.length;

    return {
      reply,
      extracted,
      intent: acceptedHelp ? 'HIGH' : intent,
      wantsHuman: human || acceptedHelp,
      optOut: false,
      isQuestion: question,
      knowledgeGap: gap,
      usedKnowledgeIds: used,
    };
  }

  async summarize({ lead, history }: SummaryInput): Promise<string> {
    const leadMsgs = history.filter((h) => h.role === 'lead').map((h) => h.content);
    const lines = [
      `Cliente demonstrou interesse em ${productLabel(lead.product).toLowerCase() || 'crédito/consórcio'}.`,
      `Valor informado: ${lead.value ? brl(lead.value) : 'não informado'}`,
      `Cidade: ${lead.city ? `${lead.city}${lead.uf ? `/${lead.uf}` : ''}` : 'não informada'}`,
      `Objetivo: ${lead.objective ?? 'não informado'}`,
      `Prazo: ${lead.term ?? 'não informado'}`,
      `Intenção: ${lead.intent === 'HIGH' ? 'Alta' : lead.intent === 'MEDIUM' ? 'Média' : 'Baixa'}`,
      `Principal objeção: ${lead.objections?.[0] ?? 'nenhuma registrada'}`,
      `Origem: ${sourceLabel(lead.source)}`,
      `Mensagens do cliente: ${leadMsgs.length}`,
      `Próxima ação sugerida: ${lead.intent === 'HIGH' ? 'Contato imediato com simulação personalizada.' : 'Contato consultivo para entender a necessidade.'}`,
    ];
    return lines.join('\n');
  }
}
