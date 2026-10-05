import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { publicCtx, systemCtx } from '@/modules/auth/context';
import { ingestLead } from '@/modules/leads/lead-engine';
import { listLeads, getLeadDetail } from '@/modules/leads/leads.service';
import { runPublicSimulation } from '@/modules/simulators/simulator.service';
import { createOpportunity, moveOpportunity } from '@/modules/opportunities/opportunity.service';
import { handleInboundMessage } from '@/modules/whatsapp/whatsapp.service';
import { executiveDashboard } from '@/modules/analytics/analytics.service';
import { resolveFilters } from '@/modules/analytics/filters';
import { track } from '@/modules/attribution/attribution.service';
import { canContactProactively } from '@/modules/messaging/messaging.service';
import { priorityLeads } from '@/modules/lead-intelligence/intelligence.service';
import { takeOver } from '@/modules/conversations/conversation.service';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let B: Org;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org A');
  B = await createOrg('Org B');
}, 120_000);

describe('Lead creation + deduplicação', () => {
  it('cria, normaliza e deduplica por telefone mantendo histórico de fontes', async () => {
    const ctx = await A.ctx(A.users.manager);
    const phone = uniquePhone();
    const first = await ingestLead(ctx, { name: 'maria da silva', phone, source: 'META', city: 'Jundiaí', uf: 'SP' });
    expect(first.deduplicated).toBe(false);
    const again = await ingestLead(ctx, { name: 'Maria Silva', phone: `+55 ${phone}`, email: 'maria@x.com', source: 'LANDING', product: 'IMOVEL' });
    expect(again).toMatchObject({ deduplicated: true, matchedBy: 'PHONE', leadId: first.leadId });
    const lead = await getLeadDetail(ctx, first.leadId);
    expect(lead.name).toBe('Maria da Silva'); // nome original preservado, normalizado
    expect(lead.email).toBe('maria@x.com'); // campo vazio preenchido
    expect(lead.product).toBe('IMOVEL');
    expect(lead.sources).toHaveLength(2);
    expect(lead.merges[0]).toMatchObject({ matchedBy: 'PHONE', mergedBy: ctx.userId });
    expect(await db.lead.count({ where: { organizationId: A.org.id, phone: lead.phone } })).toBe(1);
  });

  it('rejeita lead sem canal de contato', async () => {
    const ctx = await A.ctx(A.users.manager);
    await expect(ingestLead(ctx, { name: 'Sem Contato', source: 'MANUAL' })).rejects.toThrow(/telefone, e-mail ou CNPJ/);
  });
});

describe('Simulação → Lead → Score → Routing (+ attribution)', () => {
  it('simulador com pedido de contato qualifica e distribui pela regra', async () => {
    const t = await track({ slug: A.landing.slug, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'teste' });
    const res = await runPublicSimulation(
      { simulatorSlug: A.simulator.slug, landingSlug: A.landing.slug, sessionKey: t.sessionKey, product: 'IMOVEL', value: 400000, city: 'Jundiaí', uf: 'SP', name: 'João Teste', whatsapp: uniquePhone(), email: 'joao@t.test', requestContact: true, consentWhatsapp: false },
      { ip: '1.1.1.1', userAgent: 'vitest' }
    );
    expect(res.result.options[0].basis).toBe('DIVISAO_SIMPLES');
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'João Teste' }, include: { consultant: true } });
    expect(lead.source).toBe('GOOGLE_ADS');
    expect(['MORNO', 'QUENTE']).toContain(lead.temperature);
    expect(lead.status).toBe('ASSIGNED');
    expect(lead.consultant?.pjId).toBe(A.pjA.id); // regra "Imóveis Jundiaí" → PJ A
    const decision = await db.routingDecision.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(decision.ruleName).toBe('Imóveis Jundiaí');
    const events = await db.attributionEvent.findMany({ where: { leadId: lead.id } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['LEAD_CREATED', 'SIMULATION_COMPLETED', 'QUALIFIED', 'ASSIGNED']));
  });

  it('campos obrigatórios configuráveis são validados', async () => {
    await expect(
      runPublicSimulation({ simulatorSlug: A.simulator.slug, product: 'IMOVEL', value: 400000, name: 'Sem Cidade', whatsapp: uniquePhone() }, {})
    ).rejects.toThrow(/Cidade/);
  });

  it('sem opt-in não há contato proativo', async () => {
    const ctx = await A.ctx(A.users.manager);
    const { leadId } = await ingestLead(ctx, { name: 'Sem Optin', phone: uniquePhone(), source: 'IMPORT' });
    expect((await canContactProactively(A.org.id, leadId)).allowed).toBe(false);
  });
});

describe('Conversa → Maestro → Supervisor → Handoff', () => {
  it('lead escreve no WhatsApp, IA responde com a KB e transfere quando pedido', async () => {
    const from = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { leadId, conversationId } = await handleInboundMessage(A.org.id, { from, text: 'Oi, quero um imóvel de 300 mil em Jundiaí. Como funciona o sorteio?', externalId: 'x1' });
    let msgs = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    const firstReply = msgs.find((m) => m.senderType === 'AI')!;
    expect(firstReply.content).toMatch(/assistente virtual/i); // identifica atendimento automatizado
    expect(firstReply.content).toMatch(/sorteio|lance/i); // resposta vinda da Knowledge Base
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { memory: true } });
    expect(lead.product).toBe('IMOVEL');
    expect(lead.desiredValue).toBe(300000);
    expect(lead.memory?.city).toBe('Jundiaí');

    await handleInboundMessage(A.org.id, { from, text: 'Quero falar com um consultor', externalId: 'x2' });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { summaries: true } });
    expect(conv.mode).toBe('HUMAN');
    expect(conv.botState).toBe('PAUSED');
    expect(conv.summaries[0].content).toMatch(/Próxima ação sugerida/);
    const after = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(after.consultantId).not.toBeNull();

    // Bot pausado: nova mensagem não gera resposta automática
    await handleInboundMessage(A.org.id, { from, text: 'Alô?', externalId: 'x3' });
    msgs = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    expect(msgs.at(-1)?.senderType).toBe('LEAD');
    const exec = await db.aIExecution.findFirstOrThrow({ where: { conversationId } });
    expect(exec).toMatchObject({ status: 'COMPLETED', agentKey: expect.any(String) });
  });

  it('pergunta sem resposta na KB gera Knowledge Gap sem inventar', async () => {
    const from = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { conversationId } = await handleInboundMessage(A.org.id, { from, text: 'Qual o horário de funcionamento da loja no sábado?', externalId: 'g1' });
    expect(await db.knowledgeGap.count({ where: { conversationId } })).toBe(1);
  });

  it('opt-out pela conversa revoga consentimento e pausa a IA', async () => {
    const from = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { leadId, conversationId } = await handleInboundMessage(A.org.id, { from, text: 'oi', externalId: 'o1' });
    await handleInboundMessage(A.org.id, { from, text: 'Não quero mais receber mensagens', externalId: 'o2' });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.optOut).toBe(true);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).botState).toBe('PAUSED');
    expect(await db.privacyEvent.count({ where: { leadId, type: 'OPT_OUT' } })).toBe(1);
  });
});

describe('Lead Intelligence: ver conversa e consultor assumir', () => {
  it('lista o lead com a última conversa e o consultor assume (IA pausada)', async () => {
    const from = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { leadId, conversationId } = await handleInboundMessage(A.org.id, { from, text: 'Oi, quero um carro de 80 mil', externalId: 'li1' });
    const ctx = await A.ctx(A.users.manager);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    const list = await priorityLeads(ctx, 500, { temperature: lead.temperature });
    const row = list.find((l) => l.id === leadId)!;
    expect(row.conversations[0]).toMatchObject({ id: conversationId, mode: 'AI' });

    const conv = await takeOver(ctx, conversationId);
    expect(conv).toMatchObject({ mode: 'HUMAN', botState: 'PAUSED' });
    // IA pausada: nova mensagem do lead não recebe resposta automática
    await handleInboundMessage(A.org.id, { from, text: 'Oi?', externalId: 'li2' });
    const last = await db.message.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: 'desc' } });
    expect(last.senderType).toBe('LEAD');
  });
});

describe('Opportunity + Pipeline + Analytics', () => {
  it('oportunidade é entidade separada, com histórico, e a conversão aparece no analytics', async () => {
    const ctx = await A.ctx(A.users.manager);
    const { leadId } = await ingestLead(ctx, { name: 'Cliente Pipeline', phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL', desiredValue: 250000, city: 'Jundiaí', uf: 'SP' });
    const opp = await createOpportunity(ctx, { leadId });
    expect(opp.value).toBe(250000);
    await moveOpportunity(ctx, opp.id, 'PROPOSTA');
    await expect(moveOpportunity(ctx, opp.id, 'PERDIDO')).rejects.toThrow(/motivo/);
    await moveOpportunity(ctx, opp.id, 'FECHADO');
    const done = await db.opportunity.findUniqueOrThrow({ where: { id: opp.id }, include: { activities: true } });
    expect(done.status).toBe('WON');
    expect(done.activities.map((a) => a.type)).toEqual(expect.arrayContaining(['CREATED', 'STAGE_CHANGED', 'CLOSED_WON']));
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('CONVERTED');
    const dash = await executiveDashboard(ctx, resolveFilters({ period: '7d' }));
    expect(dash.kpis.conversions).toBeGreaterThanOrEqual(1);
  });
});

describe('Multi-tenancy e escopo por perfil', () => {
  it('uma organização nunca enxerga dados de outra', async () => {
    const ctxB = await B.ctx(B.users.admin);
    const leadA = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(getLeadDetail(ctxB, leadA.id)).rejects.toThrow(/não encontrado/);
    const list = await listLeads(ctxB, {});
    expect(list.items.every((l) => l.organizationId === B.org.id)).toBe(true);
  });

  it('mesma pessoa em duas organizações não é deduplicada entre tenants', async () => {
    const phone = uniquePhone();
    const a = await ingestLead(publicCtx(A.org.id), { name: 'Pessoa X', phone, source: 'LANDING' });
    const b = await ingestLead(publicCtx(B.org.id), { name: 'Pessoa X', phone, source: 'LANDING' });
    expect(a.leadId).not.toBe(b.leadId);
    expect(b.deduplicated).toBe(false);
  });

  it('consultor vê somente seus leads; gestor de PJ somente a PJ; auditor não altera', async () => {
    const sys = systemCtx(A.org.id);
    await ingestLead(sys, { name: 'Lead Outro', phone: uniquePhone(), source: 'MANUAL' });
    const consultant = await A.ctx(A.users.consultant);
    const mine = await listLeads(consultant, { pageSize: 200 });
    expect(mine.items.every((l) => l.consultantId === consultant.consultantId)).toBe(true);
    const pjm = await A.ctx(A.users.pjManager);
    expect((await listLeads(pjm, { pageSize: 200 })).items.every((l) => l.pjId === A.pjB.id)).toBe(true);
    const auditor = await A.ctx(A.users.auditor);
    const any = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(createOpportunity(auditor, { leadId: any.id })).rejects.toThrow(/Permissão/);
  });
});
