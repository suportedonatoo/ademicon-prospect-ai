import type { PrismaClient } from '@prisma/client';
import type { Faker } from '@faker-js/faker';

// Seed V2 — escala da demonstração + dados de inteligência gerados pelos MOTORES REAIS
// (sinais, intenções, NBA, saúde, perdas, duplicidades, insights). Nada de métrica “chutada”.
// Todo conteúdo é fictício; textos da Knowledge Base são genéricos e marcados para substituição.

const KB_DISCLAIMER = 'Conteúdo genérico de demonstração — substituir por material oficial aprovado.';

type Ids = { orgId: string; regionIds: Record<string, string>; pjs: { id: string; code: string; regionId: string | null }[] };

/** +5 simuladores (15), +10 landings (20) e +10 campanhas (30). */
export async function extendAcquisition(db: PrismaClient, ids: Ids, sims: Record<string, string>, landings: Record<string, string>, disclaimer: string) {
  const P = {
    IMOVEL: { key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180, 200], minValue: 80000, maxValue: 2000000 },
    VEICULO: { key: 'VEICULO', label: 'Veículo', termOptions: [50, 70, 80], minValue: 30000, maxValue: 400000 },
    MOTO: { key: 'MOTO', label: 'Moto', termOptions: [36, 50, 60], minValue: 10000, maxValue: 120000 },
    SERVICOS: { key: 'SERVICOS', label: 'Serviços', termOptions: [24, 36, 40], minValue: 10000, maxValue: 60000 },
  };
  const extraSims = [
    { slug: 'simulador-primeiro-imovel', name: 'Simulador Primeiro Imóvel', products: [P.IMOVEL], required: ['product', 'value', 'name', 'whatsapp', 'city'] },
    { slug: 'simulador-frota', name: 'Simulador Frota', products: [P.VEICULO], required: ['product', 'value', 'name', 'whatsapp', 'email'] },
    { slug: 'simulador-reforma', name: 'Simulador Reforma', products: [P.IMOVEL, P.SERVICOS], required: ['product', 'value', 'name', 'whatsapp', 'objective'] },
    { slug: 'simulador-moto-rapido', name: 'Simulador Moto Rápido', products: [P.MOTO], required: ['product', 'value', 'name', 'whatsapp'] },
    { slug: 'simulador-veiculo-seminovo', name: 'Simulador Seminovo', products: [P.VEICULO], required: ['product', 'value', 'name', 'whatsapp', 'city'] },
  ];
  for (const s of extraSims) {
    sims[s.slug] = (await db.simulator.create({ data: { organizationId: ids.orgId, name: s.name, slug: s.slug, products: s.products, requiredFields: s.required, parametersVerified: false, disclaimer } })).id;
  }
  const pj = (code: string) => ids.pjs.find((p) => p.code === code)!;
  const extraLandings = [
    ['vinhedo-imoveis', 'Vinhedo · Imóveis', 'IMOVEL', 'PJ01', 'simulador-primeiro-imovel', 'Primeiro imóvel em Vinhedo'],
    ['valinhos-veiculos', 'Valinhos · Veículos', 'VEICULO', 'PJ03', 'simulador-veiculo-seminovo', 'Seminovo com planejamento'],
    ['sp-zona-sul-imoveis', 'SP Zona Sul · Imóveis', 'IMOVEL', 'PJ05', 'simulador-imovel', 'Apartamento na Zona Sul'],
    ['carapicuiba-motos', 'Carapicuíba · Motos', 'MOTO', 'PJ07', 'simulador-moto-rapido', 'Moto para trabalhar'],
    ['sorocaba-reforma', 'Sorocaba · Reforma', 'IMOVEL', 'PJ09', 'simulador-reforma', 'Reforme sem juros'],
    ['jundiai-frota', 'Jundiaí · Frota', 'VEICULO', 'PJ02', 'simulador-frota', 'Renove a frota da sua empresa'],
    ['campinas-primeiro-imovel', 'Campinas · Primeiro imóvel', 'IMOVEL', 'PJ04', 'simulador-primeiro-imovel', 'Saia do aluguel em Campinas'],
    ['osasco-servicos', 'Osasco · Serviços', 'SERVICOS', 'PJ08', 'simulador-servicos', 'Estudos e saúde com planejamento'],
    ['itu-veiculos', 'Itu · Veículos', 'VEICULO', 'PJ10', 'simulador-veiculo', 'Carro novo em Itu'],
    ['sp-centro-motos', 'SP Centro · Motos', 'MOTO', 'PJ06', 'simulador-moto', 'Moto na capital sem juros'],
  ] as const;
  for (const [slug, name, product, code, sim, title] of extraLandings) {
    const p = pj(code);
    landings[slug] = (
      await db.landingPage.create({
        data: { organizationId: ids.orgId, name, slug, title, subtitle: 'Consórcio com consultoria na sua região.', product, regionId: p.regionId, pjId: p.id, simulatorId: sims[sim], status: 'PUBLISHED', seo: { title, description: 'Simule seu consórcio.' }, form: { create: { organizationId: ids.orgId, fields: ['name', 'whatsapp', 'email', 'city'], requiredFields: ['name', 'whatsapp'], consentText: 'Autorizo o contato sobre esta simulação, conforme a Política de Privacidade.' } } },
      })
    ).id;
  }
  const extraCampaigns = [
    ['Search · Primeiro Imóvel Vinhedo', 'GOOGLE_ADS', 'IMOVEL', 'vinhedo-imoveis', 'ACTIVE', 7000, 40],
    ['Search · Seminovos Valinhos', 'GOOGLE_ADS', 'VEICULO', 'valinhos-veiculos', 'ACTIVE', 6000, 35],
    ['Lead Ads · Zona Sul', 'META', 'IMOVEL', 'sp-zona-sul-imoveis', 'ACTIVE', 9000, 45],
    ['Reels · Moto para trabalhar', 'INSTAGRAM', 'MOTO', 'carapicuiba-motos', 'ACTIVE', 3000, 30],
    ['Search · Reforma Sorocaba', 'GOOGLE_ADS', 'IMOVEL', 'sorocaba-reforma', 'PAUSED', 4000, 50],
    ['LinkedIn · Frota Empresas', 'META', 'VEICULO', 'jundiai-frota', 'ACTIVE', 5000, 28],
    ['Performance Max · Saia do Aluguel', 'GOOGLE_ADS', 'IMOVEL', 'campinas-primeiro-imovel', 'ACTIVE', 11000, 55],
    ['Stories · Estudos e Saúde', 'INSTAGRAM', 'SERVICOS', 'osasco-servicos', 'COMPLETED', 2500, 75],
    ['Search · Carro Novo Itu', 'GOOGLE_ADS', 'VEICULO', 'itu-veiculos', 'ACTIVE', 4500, 20],
    ['Lead Ads · Moto Capital', 'META', 'MOTO', 'sp-centro-motos', 'ACTIVE', 3500, 25],
  ] as const;
  const created: string[] = [];
  for (const [name, source, product, landing, status, budget, daysAgo] of extraCampaigns) {
    const startAt = new Date(Date.now() - daysAgo * 86_400_000);
    const c = await db.campaign.create({
      data: { organizationId: ids.orgId, name, source, product, landingPageId: landings[landing], status: status as never, budget, startAt, endAt: new Date(startAt.getTime() + 90 * 86_400_000), utmCampaign: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) },
    });
    created.push(c.id);
  }
  return created;
}

const KB_EXTRA: { title: string; category: string; status?: string; content: string }[] = [
  ['Como funciona a assembleia', 'CONSORCIO', 'As assembleias acontecem periodicamente conforme o regulamento do grupo. Nelas ocorrem as contemplações por sorteio e por lance.\n\nO consultor informa o calendário do grupo escolhido.'],
  ['O que é carta de crédito', 'CONSORCIO', 'A carta de crédito é o valor que o consorciado contemplado recebe para adquirir o bem ou serviço previsto no grupo.\n\nO valor é definido na adesão e atualizado conforme as regras do contrato.'],
  ['Lance livre', 'CONSORCIO', 'No lance livre, o consorciado oferece um valor para antecipar a contemplação. Vence a maior oferta, conforme as regras do grupo.\n\nNão há garantia de contemplação por lance.'],
  ['Lance embutido', 'CONSORCIO', 'Alguns grupos permitem usar parte da própria carta de crédito como lance (lance embutido). A disponibilidade e o percentual dependem do regulamento do grupo.'],
  ['Sorteio', 'CONSORCIO', 'Em cada assembleia há contemplação por sorteio entre os participantes em dia, conforme o regulamento. Não há data garantida de contemplação.'],
  ['Parcela e reajuste', 'CONSORCIO', 'A parcela é composta pelo valor destinado ao fundo comum e pelos custos previstos em contrato. O índice de reajuste é definido no contrato do grupo e informado na proposta oficial.'],
  ['Transferência de cota', 'CONSORCIO', 'A transferência de cota a terceiros pode ser possível mediante análise e regras da administradora. O consultor orienta o procedimento.'],
  ['Uso do FGTS', 'CONSORCIO', 'Em consórcio imobiliário, o uso do FGTS segue as regras vigentes e as condições do bem. A possibilidade deve ser confirmada com o consultor para o seu caso.'],
  ['Quitação antecipada', 'CONSORCIO', 'É possível antecipar parcelas ou quitar o saldo conforme as regras do contrato. O consultor informa o procedimento e os valores exatos.'],
  ['Documentos para a contemplação', 'PROCESSOS', 'Após a contemplação, a administradora solicita documentos do consorciado e do bem para análise de crédito e liberação da carta.\n\nA lista exata é enviada pelo consultor.'],
  ['Análise de crédito na contemplação', 'PROCESSOS', 'A liberação da carta depende de análise cadastral e de crédito, conforme política da administradora. Não prometa aprovação.'],
  ['Consórcio x financiamento', 'COMERCIAL', 'No consórcio não há cobrança de juros; há taxa de administração e demais custos previstos em contrato. No financiamento, o bem é recebido antes e há juros.\n\nCompare sempre com os valores da proposta oficial.'],
  ['Para quem o consórcio é indicado', 'COMERCIAL', 'Consórcio é indicado para quem pode planejar a compra e não precisa do bem imediatamente, ou que tem recursos para lance.'],
  ['Consórcio para empresas', 'COMERCIAL', 'Empresas podem usar consórcio para renovar frota, adquirir equipamentos ou imóveis comerciais, conforme os grupos disponíveis.'],
  ['Objeção: vou pensar', 'OBJECOES', 'Claro, sem pressa! Pensar com calma faz parte. Se quiser, um consultor envia o resumo da simulação pelo WhatsApp para você analisar quando puder.'],
  ['Objeção: parcela alta', 'OBJECOES', 'A parcela depende do valor da carta e do prazo escolhido. Prazos mais longos ou cartas de menor valor deixam a parcela menor. O consultor pode montar alternativas com a simulação oficial.'],
  ['Objeção: demora para contemplar', 'OBJECOES', 'A contemplação pode acontecer em qualquer assembleia, por sorteio ou por lance. Não existe data garantida, mas o lance é uma forma de tentar antecipar. O consórcio funciona melhor como planejamento.'],
  ['Objeção: já tenho financiamento', 'OBJECOES', 'Sem problema! Muita gente usa o consórcio para planejar o próximo bem, já que no consórcio não há juros, e sim taxa de administração. Se quiser, explico como funciona.'],
  ['Objeção: é golpe?', 'OBJECOES', 'O consórcio é regulamentado pela Lei 11.795/2008, e as administradoras precisam de autorização do Banco Central. Você pode conferir a autorização da administradora no site do Banco Central.'],
  ['Atendimento: tom de voz', 'ATENDIMENTO', 'Seja cordial, objetivo e consultivo. Frases curtas. Nunca pressione.'],
  ['Atendimento: horário', 'ATENDIMENTO', 'O horário de atendimento é definido por cada unidade. Fora do horário, o assistente registra o contato e um consultor retorna.'],
  ['Atendimento: pedido de humano', 'ATENDIMENTO', 'Sempre que o cliente pedir um humano, transfira a conversa com resumo para o consultor responsável.'],
  ['Política: não prometer aprovação', 'POLITICAS', 'É proibido garantir aprovação de crédito, contemplação ou prazos.'],
  ['Política: dados pessoais', 'POLITICAS', 'Colete apenas os dados necessários ao atendimento. Nunca compartilhe dados de um cliente com outro.'],
  ['Política: opt-out', 'POLITICAS', 'Quando o cliente pedir para não receber mensagens, interrompa os contatos ativos imediatamente e registre.'],
  ['FAQ: posso ter mais de uma cota?', 'FAQ', 'Em geral é possível ter mais de uma cota, conforme análise e regras dos grupos.'],
  ['Moro fora do Brasil (exterior): posso fazer consórcio?', 'FAQ', 'O atendimento é online, pelo WhatsApp, para brasileiros no Brasil ou no exterior. As condições para contratar morando fora (documentos e cadastro) são confirmadas pelo consultor antes de qualquer proposta.'],
  ['FAQ: o que acontece se atrasar?', 'FAQ', 'Atrasos seguem as regras do contrato (encargos e impedimentos de participar das contemplações). O consultor explica as condições.'],
  ['FAQ: posso desistir?', 'FAQ', 'A desistência segue as regras da Lei 11.795/2008 e do contrato do grupo. O consultor orienta o procedimento.'],
  ['FAQ: carta para imóvel na planta', 'FAQ', 'A utilização da carta depende das regras do grupo e da análise do bem. Confirme com o consultor.'],
  ['FAQ: seguro', 'SEGUROS', 'Alguns grupos preveem seguro prestamista. A existência e o custo constam na proposta oficial.'],
  ['FAQ: prazos dos grupos', 'FAQ', 'Os prazos disponíveis variam por grupo e produto. O simulador mostra opções ilustrativas; os oficiais estão na proposta.'],
  ['Processo: da simulação à proposta', 'PROCESSOS', 'Simulação → conversa com consultor → escolha do grupo → proposta oficial → adesão.'],
  ['Crédito: diferença para empréstimo', 'CREDITO', 'Consórcio não é empréstimo. O recurso vem do fundo comum do grupo, liberado na contemplação.', 'REVIEW'],
  ['Campanha antiga de verão', 'COMERCIAL', 'Material de campanha encerrada. Mantido apenas para histórico.', 'EXPIRED'],
  ['Rascunho: argumentos para frota', 'COMERCIAL', 'Rascunho em elaboração pela equipe de empresas.', 'DRAFT'],
].map(([title, category, content, status]) => ({ title, category, content, status })); // o aviso de demonstração fica em `source`, nunca no texto

const GAP_BANK = [
  'Vocês aceitam FGTS no lance?', 'Qual a taxa de administração desse grupo?', 'Posso transferir minha cota?', 'Tem seguro incluso?', 'Consigo usar a carta em outro estado?',
  'Qual o reajuste anual?', 'Posso quitar antes?', 'Aceita meu carro como lance?', 'Qual o horário de atendimento no sábado?', 'Vocês têm grupo de 300 meses?',
  'Posso comprar terreno com a carta?', 'Dá para usar em imóvel rural?', 'Serve para comprar caminhão usado?', 'Posso usar para pagar faculdade?', 'Qual a menor parcela possível?',
];

export async function seedV2(db: PrismaClient, orgId: string, faker: Faker) {
  const log = (s: string) => console.log(`  · ${s}`);
  const { indexDocument } = await import('../../src/modules/knowledge-base/knowledge.service');
  const { detectIntents, signalsFromMessage } = await import('../../src/modules/lead-intelligence/signal-detector');
  const { classifyLoss } = await import('../../src/modules/opportunities/health-engine');
  const { refreshIntelligenceBatch } = await import('../../src/modules/lead-intelligence/intelligence-v2.service');
  const { scanOpportunityHealth } = await import('../../src/modules/opportunities/opportunity-intelligence.service');
  const { scanDuplicates } = await import('../../src/modules/leads/duplicates.service');
  const { generateInsights } = await import('../../src/modules/insights/insights.service');
  const { ensureBaselineVersions } = await import('../../src/modules/ai/prompt-versions.service');
  const { ensureDefaultDatasets, runEvaluation } = await import('../../src/modules/ai/lab.service');
  const { systemCtx } = await import('../../src/modules/auth/context');

  // Knowledge Base → 50 documentos (ciclo de vida completo)
  const cats = await db.knowledgeCategory.findMany({ where: { organizationId: orgId } });
  for (const d of KB_EXTRA) {
    const doc = await db.knowledgeDocument.create({
      data: { organizationId: orgId, categoryId: cats.find((c) => c.key === d.category)!.id, title: d.title, source: KB_DISCLAIMER, status: d.status ?? 'PUBLISHED', ownerName: 'Caio Teixeira', validUntil: d.status === 'EXPIRED' ? new Date(Date.now() - 30 * 86_400_000) : null, versions: { create: { organizationId: orgId, version: 1, content: d.content, changeNote: 'Versão inicial (demo)' } } },
    });
    if (doc.status === 'PUBLISHED') await indexDocument(orgId, doc.id);
  }
  log(`Knowledge Base: ${await db.knowledgeDocument.count({ where: { organizationId: orgId } })} documentos`);

  // Knowledge gaps → 100 (perguntas reais do banco de dúvidas, associadas a conversas)
  const convs = await db.conversation.findMany({ where: { organizationId: orgId }, select: { id: true, leadId: true }, take: 300 });
  const existingGaps = await db.knowledgeGap.count({ where: { organizationId: orgId } });
  await db.knowledgeGap.createMany({
    data: Array.from({ length: Math.max(0, 100 - existingGaps) }, (_, i) => {
      const c = convs[i % convs.length];
      return { organizationId: orgId, question: GAP_BANK[i % GAP_BANK.length], leadId: c?.leadId, conversationId: c?.id, agentKey: i % 3 ? 'PROSPECT' : 'QUALIFICATION', status: i % 4 === 0 ? 'RESOLVED' : 'OPEN', createdAt: new Date(Date.now() - faker.number.int({ min: 1, max: 60 }) * 86_400_000) };
    }),
  });
  log(`Knowledge gaps: ${await db.knowledgeGap.count({ where: { organizationId: orgId } })}`);

  // Automações → 100 (modelos por PJ/produto; só as 3 principais ficam ativas para não gerar ruído)
  const pjs = await db.pJ.findMany({ where: { organizationId: orgId }, select: { id: true, code: true } });
  const products = ['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'BENS_MOVEIS'];
  const current = await db.automationRule.count({ where: { organizationId: orgId } });
  const templates = [];
  for (const pj of pjs) {
    for (const product of products) {
      templates.push({ organizationId: orgId, name: `[Modelo] ${pj.code} · ${product} · lead quente → tarefa`, trigger: 'lead.scored', active: false, conditions: [{ field: 'lead.pjId', op: 'eq', value: pj.id }, { field: 'lead.product', op: 'eq', value: product }, { field: 'event.score', op: 'gte', value: 71 }], actions: [{ type: 'create_task', params: { taskType: 'CONTACT', title: 'Contatar lead quente: {lead}', dueInHours: 1, priority: 'URGENT' } }] });
      templates.push({ organizationId: orgId, name: `[Modelo] ${pj.code} · ${product} · handoff → avisar gestor`, trigger: 'conversation.handoff', active: false, conditions: [{ field: 'lead.pjId', op: 'eq', value: pj.id }, { field: 'lead.product', op: 'eq', value: product }], actions: [{ type: 'notify_role', params: { roles: ['PJ_MANAGER'], title: 'Handoff: {lead}' } }] });
    }
  }
  await db.automationRule.createMany({ data: templates.slice(0, Math.max(0, 100 - current)) });
  log(`Automações: ${await db.automationRule.count({ where: { organizationId: orgId } })} (3 ativas + modelos)`);

  // Intenção e sinais de compra a partir das MENSAGENS reais do seed (mesmas regras de produção)
  const inbound = await db.message.findMany({ where: { organizationId: orgId, direction: 'INBOUND', senderType: 'LEAD' }, select: { id: true, content: true, createdAt: true, conversationId: true, conversation: { select: { leadId: true } } }, orderBy: { createdAt: 'asc' } });
  const firstReply = new Set<string>();
  const intents = [];
  const signals = [];
  for (const m of inbound) {
    const leadId = m.conversation.leadId;
    for (const i of detectIntents(m.content)) intents.push({ organizationId: orgId, leadId, conversationId: m.conversationId, messageId: m.id, type: i.type, evidence: i.evidence.slice(0, 300), confidence: i.confidence, origin: 'RULE', createdAt: m.createdAt });
    const isFirst = !firstReply.has(m.conversationId);
    firstReply.add(m.conversationId);
    for (const s of signalsFromMessage(m.content, { firstReply: isFirst })) signals.push({ organizationId: orgId, leadId, type: s.type, source: 'CONVERSATION', confidence: s.confidence, evidence: s.evidence.slice(0, 300), createdAt: m.createdAt });
  }
  const sims = await db.simulation.findMany({ where: { organizationId: orgId, leadId: { not: null } }, select: { leadId: true, createdAt: true, product: true, value: true } });
  for (const s of sims) signals.push({ organizationId: orgId, leadId: s.leadId!, type: 'simulation_requested', source: 'SIMULATOR', confidence: 1, evidence: `Simulação ${s.product} · R$ ${s.value.toLocaleString('pt-BR')}`, createdAt: s.createdAt });
  const withSim = await db.lead.findMany({ where: { organizationId: orgId, signals: { path: ['simulationStarted'], equals: true } }, select: { id: true, createdAt: true } });
  for (const l of withSim) signals.push({ organizationId: orgId, leadId: l.id, type: 'simulation_requested', source: 'LANDING', confidence: 0.9, evidence: 'Simulador usado na landing', createdAt: l.createdAt });
  await db.intentEvent.createMany({ data: intents });
  await db.buyingSignal.createMany({ data: signals });
  const lastSignal = await db.buyingSignal.groupBy({ by: ['leadId'], where: { organizationId: orgId }, _max: { createdAt: true } });
  for (const l of lastSignal) await db.lead.update({ where: { id: l.leadId }, data: { lastSignalAt: l._max.createdAt } });
  log(`Intenções: ${intents.length} · sinais de compra: ${signals.length}`);

  // Loss Intelligence: perdas históricas classificadas pela mesma regra do sistema
  // (as perdas feitas pelos cenários já passaram pelo fluxo real e têm LossRecord)
  const recorded = (await db.lossRecord.findMany({ where: { organizationId: orgId }, select: { opportunityId: true } })).map((r) => r.opportunityId);
  const lost = await db.opportunity.findMany({ where: { organizationId: orgId, status: 'LOST', id: { notIn: recorded } }, include: { stage: true, activities: { orderBy: { createdAt: 'desc' }, take: 2 } } });
  const COMPETITORS = ['Outra administradora', 'Banco (financiamento)', null, null];
  for (const o of lost) {
    const category = classifyLoss(o.lostReason);
    const prevStage = o.activities.find((a) => a.type === 'CLOSED_LOST')?.fromStage ?? o.stage.key;
    const competitor = category === 'CONCORRENTE' ? faker.helpers.arrayElement(COMPETITORS.filter(Boolean) as string[]) : null;
    await db.opportunity.update({ where: { id: o.id }, data: { lostCategory: category, competitor } });
    await db.lossRecord.create({ data: { organizationId: orgId, opportunityId: o.id, leadId: o.leadId, category, reason: o.lostReason, competitor, stageKey: prevStage, product: o.product, pjId: o.pjId, consultantId: o.consultantId, campaignId: o.campaignId, value: o.value, createdAt: o.closedAt ?? o.updatedAt } });
  }
  log(`Perdas registradas: ${lost.length}`);

  // Opportunity Intelligence: tempo real na etapa (última mudança) + cenário "parada"
  const open = await db.opportunity.findMany({ where: { organizationId: orgId, status: 'OPEN' }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  for (const [i, o] of open.entries()) {
    const lastAct = o.activities[0]?.createdAt ?? o.createdAt;
    const stale = i % 6 === 0 ? new Date(Date.now() - faker.number.int({ min: 16, max: 40 }) * 86_400_000) : null; // cenário: paradas
    await db.opportunity.update({ where: { id: o.id }, data: { stageChangedAt: stale ?? lastAct, lastActivityAt: stale ?? lastAct } });
  }
  const health = await scanOpportunityHealth(orgId);
  log(`Saúde das oportunidades: ${JSON.stringify(health)}`);

  // Cenário: duplicidades prováveis (mesma pessoa com telefone/e-mail diferentes)
  const sample = await db.lead.findMany({ where: { organizationId: orgId, deletedAt: null, phone: { not: null } }, take: 5, skip: 40, orderBy: { createdAt: 'asc' } });
  for (const l of sample) {
    const [first, ...rest] = l.name.split(' ');
    const phone = l.phone!.slice(0, 4) + l.phone!.slice(5); // sem o 9º dígito — mesma pessoa, cadastro antigo
    await db.lead.create({ data: { organizationId: orgId, name: `${first} ${rest.slice(-1)[0] ?? ''}`.trim(), phone, city: l.city, uf: l.uf, source: 'IMPORT', dataOrigin: 'Importação de base própria (demo)', product: l.product, createdAt: new Date(l.createdAt.getTime() - 20 * 86_400_000) } });
  }
  const dup = await scanDuplicates(orgId, { days: 400, limit: 2000 });
  log(`Duplicidades: ${JSON.stringify(dup)}`);

  // Playbooks comerciais (ativos) — segmentados por temperatura
  const pbs = [
    { key: 'lead_quente', name: 'Lead quente: contato imediato', priority: 10, segment: { temperatures: ['QUENTE'] }, steps: [{ type: 'ACTION', action: 'notify_consultant', params: { title: '🔥 Lead quente: {lead}' } }, { type: 'ACTION', action: 'create_task', params: { taskType: 'CONTACT', title: 'Ligar agora para {lead}', dueInHours: 1, priority: 'URGENT' } }, { type: 'WAIT', minutes: 15 }, { type: 'CONDITION', condition: { field: 'lead.status', op: 'eq', value: 'ASSIGNED' }, onFalse: 'STOP' }, { type: 'ACTION', action: 'notify_role', params: { roles: ['PJ_MANAGER', 'MANAGER'], title: 'Lead quente sem atendimento: {lead}' } }] },
    { key: 'lead_morno', name: 'Lead morno: qualificar e próxima ação', priority: 20, segment: { temperatures: ['MORNO'] }, steps: [{ type: 'ACTION', action: 'recompute_nba', params: {} }, { type: 'ACTION', action: 'create_task', params: { taskType: 'FOLLOW_UP', title: 'Qualificar {lead}', dueInHours: 24, priority: 'MEDIUM' } }, { type: 'WAIT', minutes: 1440 }, { type: 'ACTION', action: 'recompute_nba', params: {} }] },
    { key: 'reativacao', name: 'Reativação: lead que voltou', priority: 5, segment: { statuses: ['ASSIGNED', 'IN_CONVERSATION', 'QUALIFIED'], temperatures: ['MORNO', 'QUENTE', 'FRIO'] }, steps: [{ type: 'ACTION', action: 'notify_consultant', params: { title: '♻️ {lead} voltou a interagir' } }, { type: 'ACTION', action: 'create_task', params: { taskType: 'FOLLOW_UP', title: 'Retomar contato com {lead}', dueInHours: 4, priority: 'HIGH' } }] },
  ];
  for (const p of pbs) {
    await db.playbookVersion.create({ data: { organizationId: orgId, playbookKey: p.key, version: 1, name: p.name, segment: p.segment, steps: p.steps as object, priority: p.priority, status: p.key === 'reativacao' ? 'DRAFT' : 'ACTIVE', publishedAt: p.key === 'reativacao' ? null : new Date() } });
  }
  log('Playbooks: 2 ativos + 1 rascunho');

  // Prompts (v1 = produção) e AI Evaluation Lab (execução real com o provider configurado)
  await ensureBaselineVersions(orgId);
  await ensureDefaultDatasets(orgId);
  const admin = await db.user.findFirst({ where: { organizationId: orgId, role: { key: 'SUPER_ADMIN' } }, select: { id: true } });
  const { buildUserCtx } = await import('../../src/modules/auth/auth.service');
  const actx = admin ? await buildUserCtx(admin.id) : systemCtx(orgId);
  for (const d of await db.aIEvalDataset.findMany({ where: { organizationId: orgId } })) await runEvaluation(actx!, { datasetId: d.id, agentKey: 'PROSPECT' });
  log('AI Lab: 4 datasets avaliados');

  // Experimento A/B (rodando, sem exposições inventadas — elas chegam com as visitas)
  const landing = await db.landingPage.findFirst({ where: { organizationId: orgId, slug: 'jundiai-imoveis' } });
  if (landing) {
    await db.experiment.create({ data: { organizationId: orgId, name: 'Headline · Jundiaí Imóveis', hypothesis: 'Headline com “sem juros” gera mais pedidos de contato', target: 'HEADLINE', targetId: landing.id, primaryMetric: 'OPPORTUNITIES', status: 'RUNNING', startedAt: new Date(), variants: { create: [{ organizationId: orgId, key: 'A', name: 'Atual', weight: 50 }, { organizationId: orgId, key: 'B', name: 'Sem juros + prazo', weight: 50, config: { title: 'Seu imóvel em Jundiaí sem juros: planeje hoje' } }] } } });
    await db.experiment.create({ data: { organizationId: orgId, name: 'CTA · Simulador', target: 'CTA', targetId: landing.id, primaryMetric: 'QUALIFIED', status: 'DRAFT', variants: { create: [{ organizationId: orgId, key: 'A', name: 'Simular agora', weight: 50 }, { organizationId: orgId, key: 'B', name: 'Ver minhas parcelas', weight: 50, config: { ctaText: 'Ver minhas parcelas' } }] } } });
  }

  // Lead Intelligence: sub-scores, ciclo de vida e NBA de TODOS os leads (motor real)
  const t = Date.now();
  const r = await refreshIntelligenceBatch(orgId, { limit: 5000 });
  log(`Inteligência recalculada: ${r.refreshed} leads em ${Math.round((Date.now() - t) / 1000)}s`);

  // AI Insights: só o que as regras encontram nos dados atuais (sem repetir o mesmo insight por semanas).
  await generateInsights(orgId);
  log(`AI Insights: ${await db.aIInsight.count({ where: { organizationId: orgId } })}`);
}
