import type { PrismaClient, WhatsAppNumber } from '@prisma/client';
import type { Faker } from '@faker-js/faker';

// Conversas fictícias com IA (sem números/taxas: as respostas seguem a Knowledge Base genérica).

const DISCLOSURE = 'Sou o assistente virtual da equipe comercial. Um consultor humano pode assumir a conversa quando você quiser.';
const PRODUCT_WORD: Record<string, string> = { IMOVEL: 'imóvel', VEICULO: 'veículo', MOTO: 'moto', SERVICOS: 'serviços', BENS_MOVEIS: 'bens móveis' };

const GAP_QUESTIONS = [
  'Vocês aceitam FGTS no lance?',
  'Qual a taxa de administração desse grupo?',
  'Posso transferir minha cota para outra pessoa?',
  'Tem seguro de vida incluso na parcela?',
  'Consigo usar a carta em outro estado?',
  'Qual o reajuste anual da parcela?',
  'Posso quitar tudo antes do prazo?',
  'Aceita meu carro atual como lance?',
];

type Lead = { id: string; name: string; product: string | null; desiredValue: number | null; city: string | null; status: string; consultantId: string | null; createdAt: Date; source: string; score: number };

export async function buildConversation(
  db: PrismaClient,
  p: { orgId: string; lead: Lead; consultantName: string; numbers: WhatsAppNumber[]; idx: number; faker: Faker }
) {
  const { orgId, lead, faker, idx } = p;
  const first = lead.name.split(' ')[0];
  const product = lead.product ?? 'IMOVEL';
  const handoff = !!lead.consultantId && idx % 5 !== 0 && ['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY', 'CONVERTED'].includes(lead.status) && idx % 3 !== 1;
  const agent = lead.score >= 61 ? 'QUALIFICATION' : 'PROSPECT';
  const withGap = idx < GAP_QUESTIONS.length;
  const objection = faker.helpers.arrayElement(['contemplação', 'parcela', null, null]);

  const script: { s: 'AI' | 'LEAD' | 'HUMAN' | 'SYSTEM'; t: string }[] = [
    { s: 'AI', t: `Olá, ${first}! ${DISCLOSURE} Vi seu interesse em ${PRODUCT_WORD[product]}. Qual é o seu objetivo com esse crédito?` },
    { s: 'LEAD', t: faker.helpers.arrayElement(['Quero comprar', 'Estou planejando a compra', 'Quero sair do aluguel', 'Quero trocar o meu', 'Pensando em investir']) },
  ];
  if (!lead.desiredValue) {
    script.push({ s: 'AI', t: 'Entendi. Você já tem uma ideia do valor do bem ou da carta de crédito que procura?' });
    script.push({ s: 'LEAD', t: `Uns ${faker.number.int({ min: 50, max: 600 })} mil` });
  }
  if (!lead.city) {
    script.push({ s: 'AI', t: 'Em qual cidade você está? Assim direciono você para a equipe da sua região.' });
    script.push({ s: 'LEAD', t: 'Jundiaí' });
  }
  if (objection === 'contemplação') {
    script.push({ s: 'LEAD', t: 'Mas quanto tempo demora pra ser contemplado?' });
    script.push({ s: 'AI', t: 'A contemplação acontece nas assembleias mensais do grupo, por sorteio ou por lance. Não existe data garantida de contemplação. O consultor pode explicar o histórico e as regras do grupo para ajudar no seu planejamento.' });
  } else if (objection === 'parcela') {
    script.push({ s: 'LEAD', t: 'Tenho medo da parcela ficar muito cara' });
    script.push({ s: 'AI', t: 'A parcela depende do valor da carta de crédito e do prazo escolhido. Prazos mais longos ou cartas de menor valor resultam em parcelas menores, e o consultor pode montar alternativas que caibam no seu orçamento.' });
  }
  if (withGap) {
    script.push({ s: 'LEAD', t: GAP_QUESTIONS[idx] });
    script.push({ s: 'AI', t: 'Boa pergunta. Não tenho uma informação confirmada para te passar agora, e prefiro não arriscar. Vou registrar para um consultor te responder com precisão.' });
  }
  if (handoff) {
    script.push({ s: 'AI', t: 'Com essas informações já dá para montar uma simulação personalizada. Quer que um consultor especialista prepare isso para você, sem compromisso?' });
    script.push({ s: 'LEAD', t: faker.helpers.arrayElement(['Quero sim', 'Pode ser', 'Sim, por favor', 'Quero falar com um consultor']) });
    script.push({ s: 'AI', t: `Obrigado pelas informações! Um consultor (${p.consultantName.split(' ')[0]}) vai continuar o atendimento por aqui.` });
    script.push({ s: 'SYSTEM', t: 'Handoff: IA pausada · consultor ativo · motivo: Pedido explícito do cliente' });
    if (idx % 2 === 0) script.push({ s: 'HUMAN', t: `Oi ${first}, aqui é ${p.consultantName.split(' ')[0]}! Já recebi o resumo da conversa. Posso te ligar hoje para apresentar as opções?` });
    if (idx % 4 === 0) script.push({ s: 'LEAD', t: 'Pode sim, depois das 18h' });
  }

  const start = new Date(lead.createdAt.getTime() + faker.number.int({ min: 1, max: 30 }) * 60_000);
  const number = p.numbers.find((n) => n.purpose === (agent === 'QUALIFICATION' ? 'QUALIFICATION_BOT' : 'PROSPECT_BOT'));
  const conv = await db.conversation.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      channel: 'WHATSAPP',
      whatsappNumberId: number?.id,
      mode: handoff ? 'HUMAN' : 'AI',
      botState: handoff ? 'PAUSED' : 'ACTIVE',
      currentAgent: agent,
      assignedConsultantId: lead.consultantId,
      createdAt: start,
      lastMessageAt: new Date(start.getTime() + script.length * 3 * 60_000),
    },
  });

  let t = start.getTime();
  for (const [i, m] of script.entries()) {
    t += faker.number.int({ min: 20, max: 400 }) * 1000;
    let execId: string | undefined;
    if (m.s === 'AI') {
      const blocked = idx % 17 === 3 && i === 2;
      const latency = faker.number.int({ min: 350, max: 2400 });
      const exec = await db.aIExecution.create({
        data: {
          organizationId: orgId,
          leadId: lead.id,
          conversationId: conv.id,
          agentKey: agent,
          playbookKey: i === 0 ? (agent === 'QUALIFICATION' ? 'qualificacao' : 'primeiro_contato') : objection === 'contemplação' ? 'objecao_contemplacao' : objection === 'parcela' ? 'objecao_parcela' : 'qualificacao',
          provider: 'mock',
          model: 'mock-rules-v1',
          status: blocked ? 'BLOCKED' : 'COMPLETED',
          input: { text: script[i - 1]?.t ?? null },
          output: { final: m.t, draft: blocked ? `${m.t} Com um bom lance sua contemplação é garantida.` : m.t },
          supervisorVerdict: blocked
            ? { action: 'BLOCKED', violations: [{ check: 'policy', rule: 'Garantia de contemplação', excerpt: 'contemplação é garantida' }] }
            : { action: 'APPROVED', violations: [] },
          latencyMs: latency,
          startedAt: new Date(t - latency),
          completedAt: new Date(t),
        },
      });
      execId = exec.id;
      await db.aIEvent.create({ data: { organizationId: orgId, executionId: exec.id, type: blocked ? 'supervisor.blocked' : 'supervisor.approved', payload: {}, createdAt: new Date(t) } });
      if (idx % 7 === 0 && i === 0) {
        await db.aIFeedback.create({ data: { organizationId: orgId, executionId: exec.id, rating: faker.helpers.arrayElement(['GOOD', 'GOOD', 'NEEDS_REVIEW', 'BAD']), comment: 'Avaliação de demonstração' } });
      }
    }
    await db.message.create({
      data: {
        organizationId: orgId,
        conversationId: conv.id,
        direction: m.s === 'LEAD' ? 'INBOUND' : 'OUTBOUND',
        senderType: m.s,
        agentKey: m.s === 'AI' ? agent : null,
        senderName: m.s === 'HUMAN' ? p.consultantName : null,
        content: m.t,
        status: m.s === 'LEAD' ? 'DELIVERED' : 'SENT',
        aiExecutionId: execId,
        createdAt: new Date(t),
      },
    });
  }

  if (withGap) {
    await db.knowledgeGap.create({ data: { organizationId: orgId, question: GAP_QUESTIONS[idx], leadId: lead.id, conversationId: conv.id, agentKey: agent, context: { product }, answerGiven: 'Registrado para o consultor responder.', createdAt: new Date(t) } });
  }

  const objections = objection === 'contemplação' ? ['Prazo de contemplação'] : objection === 'parcela' ? ['Valor da parcela'] : [];
  await db.leadMemory.create({
    data: { organizationId: orgId, leadId: lead.id, product, value: lead.desiredValue, city: lead.city ?? 'Jundiaí', objections, intent: handoff ? 'HIGH' : 'MEDIUM', preferences: handoff ? { preferredChannel: 'PHONE' } : {} },
  });

  if (handoff) {
    const summary = [
      `Cliente demonstrou interesse em ${PRODUCT_WORD[product]}.`,
      `Valor informado: ${lead.desiredValue ? `R$ ${lead.desiredValue.toLocaleString('pt-BR')}` : 'informado na conversa'}`,
      `Cidade: ${lead.city ?? 'Jundiaí'}`,
      `Intenção: Alta`,
      `Principal objeção: ${objections[0] ?? 'nenhuma registrada'}`,
      `Origem: ${lead.source}`,
      'Próxima ação sugerida: Contato consultivo com simulação personalizada.',
    ].join('\n');
    await db.conversationSummary.create({ data: { organizationId: orgId, conversationId: conv.id, leadId: lead.id, kind: 'HANDOFF', content: summary, structured: { reason: 'Pedido explícito do cliente', objections }, createdAt: new Date(t) } });
    await db.lead.update({ where: { id: lead.id }, data: { aiSummary: summary, lastAgent: agent, lastInteractionAt: new Date(t) } });
    await db.leadActivity.create({ data: { organizationId: orgId, leadId: lead.id, type: 'HANDOFF', description: `Transferido da IA para ${p.consultantName} · Pedido explícito do cliente`, actorType: 'AI', createdAt: new Date(t) } });
  } else {
    await db.lead.update({ where: { id: lead.id }, data: { lastAgent: agent, lastInteractionAt: new Date(t) } });
  }
}
