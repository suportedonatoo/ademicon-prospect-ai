import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { systemCtx } from '@/modules/auth/context';
import { ingestLead } from '@/modules/leads/lead-engine';
import { handleInboundMessage, receiveWebhook } from '@/modules/whatsapp/whatsapp.service';
import { takeOver, pauseAI, closeConversation, transferConversation } from '@/modules/conversations/conversation.service';
import { getLeadDNA, listOpenNba, refreshLeadIntelligence, resolveNba } from '@/modules/lead-intelligence/intelligence-v2.service';
import { createOpportunity, moveOpportunity } from '@/modules/opportunities/opportunity.service';
import { refreshOpportunityHealth } from '@/modules/opportunities/opportunity-intelligence.service';
import { listDuplicates, resolveDuplicate, scanDuplicates } from '@/modules/leads/duplicates.service';
import { notifyUser, listNotifications, openNotification, updatePreferences } from '@/modules/notifications/notification.service';
import { createExtensionToken, ctxFromDeviceToken, resolveDeepLink, revokeDevice, sendToPhone } from '@/modules/devices/device.service';
import { globalSearch } from '@/modules/search/search.service';
import { recoveryCenter } from '@/modules/recovery/recovery.service';
import { supervisorCockpit, operationHealth } from '@/modules/operations/operations.service';
import { lossIntelligence, revenueFunnel, campaignIntelligence } from '@/modules/revenue/revenue.service';
import { resolveFilters } from '@/modules/analytics/filters';
import { savePlaybookVersion, setPlaybookStatus, startPlaybookForLead, tickPlaybooks } from '@/modules/playbooks/playbook.service';
import { setDocumentStatus } from '@/modules/knowledge-base/knowledge.service';
import { searchKnowledge } from '@/modules/knowledge-base/knowledge.service';
import { labTest, listDatasets, runEvaluation } from '@/modules/ai/lab.service';
import { createPromptVersion, listPromptVersions, setPromptStatus } from '@/modules/ai/prompt-versions.service';
import { createExperiment, experimentResults, pickVariant, setExperimentStatus } from '@/modules/experiments/experiment.service';
import { generateInsights } from '@/modules/insights/insights.service';
import { scanSla } from '@/modules/sla/sla.service';
import { setFlag } from '@/modules/organizations/flags.service';
import { copilot, battlecard } from '@/modules/copilot/copilot.service';
import { customerJourney } from '@/modules/coach/coach.service';
import { dispatchOutbox, enqueueOutbox } from '@/lib/outbox';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let B: Org;
const waNumber = () => `55119${String(Math.floor(10000000 + Math.random() * 89999999))}`;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org A');
  B = await createOrg('Org B');
}, 120_000);

describe('Lead Intelligence V2 — intenção, sinais, sub-scores e NBA', () => {
  it('mensagem do cliente gera IntentEvents/BuyingSignals com evidência e uma NBA aberta', async () => {
    const from = waNumber();
    const { leadId } = await handleInboundMessage(A.org.id, { from, text: 'Oi! Quero um imóvel de 400 mil em Jundiaí, quanto fica a parcela? me liga hoje', externalId: `v2-${from}-1` });
    const intents = await db.intentEvent.findMany({ where: { leadId } });
    expect(intents.map((i) => i.type)).toEqual(expect.arrayContaining(['FINANCIAL_INTEREST', 'CALL_REQUEST']));
    expect(intents.every((i) => i.evidence.length > 0 && i.origin === 'RULE')).toBe(true);
    const signals = await db.buyingSignal.findMany({ where: { leadId } });
    expect(signals.map((s) => s.type)).toEqual(expect.arrayContaining(['replied', 'price_question']));
    const r = await refreshLeadIntelligence(A.org.id, leadId);
    expect(r!.subScores.intent).toBeGreaterThan(0);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.intentScore).toBe(r!.subScores.intent);
    const open = await db.nextBestAction.findMany({ where: { leadId, status: 'OPEN' } });
    expect(open).toHaveLength(1); // no máximo uma NBA aberta por lead
    expect((open[0].signals as { key: string }[]).length).toBeGreaterThan(0);
    const ctx = await A.ctx(A.users.manager);
    const dna = await getLeadDNA(ctx, leadId);
    expect(dna.scores.method).toBe('RULE');
    expect(dna.intent.events.length).toBeGreaterThan(0);
  });

  it('NBA pode ser resolvida e a fila respeita o escopo do consultor', async () => {
    const consultant = await A.ctx(A.users.consultant);
    const manager = await A.ctx(A.users.manager);
    const all = await listOpenNba(manager, {});
    const mine = await listOpenNba(consultant, {});
    expect(mine.every((n) => all.some((a) => a.id === n.id))).toBe(true);
    if (all[0]) {
      await resolveNba(manager, all[0].id, 'DONE');
      expect((await db.nextBestAction.findUniqueOrThrow({ where: { id: all[0].id } })).status).toBe('DONE');
    }
  });

  it('decaimento: lead parado há 70 dias vai para REACTIVATION e novo sinal o reaquece', async () => {
    const ctx = systemCtx(A.org.id);
    const { leadId } = await ingestLead(ctx, { name: 'Lead Antigo', phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL' });
    const old = new Date(Date.now() - 70 * 86_400_000);
    await db.lead.update({ where: { id: leadId }, data: { createdAt: old, lastInteractionAt: old, lastSignalAt: null } });
    await refreshLeadIntelligence(A.org.id, leadId);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).lifecycle).toBe('REACTIVATION');
    await db.lead.update({ where: { id: leadId }, data: { lastSignalAt: new Date(), lastInteractionAt: new Date() } });
    const r = await refreshLeadIntelligence(A.org.id, leadId);
    expect(r!.reactivated).toBe(true);
    expect(await db.intentEvent.count({ where: { leadId, type: 'RENEWED_INTEREST' } })).toBe(1);
  });
});

describe('Webhook idempotente', () => {
  it('o mesmo webhook duas vezes não cria mensagem nem resposta duplicada', async () => {
    const from = waNumber();
    const payload = { from, text: 'Olá, tenho interesse', id: `wamid.dup-${from}` };
    const r1 = await receiveWebhook('whatsapp', A.org.slug, payload, {});
    const r2 = await receiveWebhook('whatsapp', A.org.slug, payload, {});
    expect(r1.ok).toBe(true);
    expect(r2).toMatchObject({ ok: true, duplicate: true });
    const lead = await db.leadIdentity.findFirstOrThrow({ where: { organizationId: A.org.id, value: from } });
    expect(await db.message.count({ where: { conversation: { leadId: lead.leadId }, direction: 'INBOUND' } })).toBe(1);
  });
});

describe('Opportunity Intelligence + Loss Intelligence', () => {
  it('perda gera LossRecord categorizado e aparece na Loss Intelligence; parada é detectada', async () => {
    const ctx = await A.ctx(A.users.manager);
    const { leadId } = await ingestLead(ctx, { name: 'Cliente Perda', phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL', desiredValue: 300000 });
    const opp = await createOpportunity(ctx, { leadId });
    const stale = new Date(Date.now() - 20 * 86_400_000);
    await db.opportunity.update({ where: { id: opp.id }, data: { stageChangedAt: stale, lastActivityAt: stale } });
    const h = await refreshOpportunityHealth(A.org.id, opp.id);
    expect(h!.health).toBe('STALLED');
    await moveOpportunity(ctx, opp.id, 'PERDIDO', 'Fechou com outra administradora', { competitor: 'Concorrente X' });
    const rec = await db.lossRecord.findUniqueOrThrow({ where: { opportunityId: opp.id } });
    expect(rec).toMatchObject({ category: 'CONCORRENTE', competitor: 'Concorrente X' });
    const li = await lossIntelligence(ctx, resolveFilters({}));
    expect(li.total).toBeGreaterThanOrEqual(1);
    expect(li.byCategory[0].key).toBe('CONCORRENTE');
  });
});

describe('Duplicidade avançada (revisão humana)', () => {
  it('detecta par provável sem mesclar sozinho e mescla preservando histórico', async () => {
    const ctx = await A.ctx(A.users.manager);
    const a = await ingestLead(ctx, { name: 'Roberta Figueiredo Lima', phone: '(11) 98765-1234', source: 'MANUAL', city: 'Jundiaí' });
    const b = await ingestLead(ctx, { name: 'Roberta F. Lima', phone: '(11) 8765-1234', source: 'LANDING', city: 'Jundiaí', email: 'roberta@x.test' });
    expect(a.leadId).not.toBe(b.leadId); // identidade diferente → não funde automaticamente
    await scanDuplicates(A.org.id);
    const { items } = await listDuplicates(ctx, {});
    const pair = items.find((i) => [i.leadAId, i.leadBId].includes(a.leadId) && [i.leadAId, i.leadBId].includes(b.leadId))!;
    expect(pair.level).toBe('MATCH_HIGH');
    await db.leadActivity.create({ data: { organizationId: A.org.id, leadId: b.leadId, type: 'NOTE', description: 'nota do duplicado', actorType: 'USER' } });
    await resolveDuplicate(ctx, pair.id, { action: 'MERGE', keepId: a.leadId });
    const kept = await db.lead.findUniqueOrThrow({ where: { id: a.leadId } });
    expect(kept.email).toBe('roberta@x.test');
    expect(await db.leadActivity.count({ where: { leadId: a.leadId, description: 'nota do duplicado' } })).toBe(1);
    expect((await db.lead.findUniqueOrThrow({ where: { id: b.leadId } })).deletedAt).not.toBeNull();
    expect(await db.leadMerge.count({ where: { leadId: a.leadId } })).toBeGreaterThanOrEqual(1);
  });
});

describe('Notificações: preferências, silêncio, dedupe e clique', () => {
  it('dedupeKey evita duplicata; silêncio retém não críticos; clique registra e devolve link interno', async () => {
    const ctx = await A.ctx(A.users.consultant);
    await notifyUser(A.org.id, ctx.userId!, { type: 'task.created', title: 'T1', link: '/tarefas', dedupeKey: 'k1' });
    await notifyUser(A.org.id, ctx.userId!, { type: 'task.created', title: 'T1 de novo', link: '/tarefas', dedupeKey: 'k1' });
    expect(await db.notification.count({ where: { userId: ctx.userId!, dedupeKey: 'k1' } })).toBe(1);

    // silêncio 24h (00:00–23:59) — só exceções passam
    await updatePreferences(ctx, { quietEnabled: true, quietStart: '00:00', quietEnd: '23:59' });
    const held = await notifyUser(A.org.id, ctx.userId!, { type: 'task.created', title: 'Silenciada', link: '/tarefas' });
    const hot = await notifyUser(A.org.id, ctx.userId!, { type: 'lead.hot', priority: 'HIGH', title: 'Quente', link: '/leads' });
    expect(held!.heldUntil).not.toBeNull();
    expect(hot!.heldUntil).toBeNull();
    await updatePreferences(ctx, { quietEnabled: false });

    const opened = await openNotification(ctx, hot!.id, 'desktop');
    expect(opened.link).toBe('/leads');
    const n = await db.notification.findUniqueOrThrow({ where: { id: hot!.id } });
    expect(n.clickedAt).not.toBeNull();
    const evil = await notifyUser(A.org.id, ctx.userId!, { type: 'task.created', title: 'x', link: '//evil.example.com' });
    expect((await openNotification(ctx, evil!.id, 'bell')).link).toBe('/notificacoes'); // sem open redirect
    // Outro usuário não abre notificação alheia
    const mgr = await A.ctx(A.users.manager);
    await expect(openNotification(mgr, hot!.id, 'bell')).rejects.toThrow();
    expect((await listNotifications(ctx, { status: 'unread' })).items.every((i) => !i.readAt)).toBe(true);
  });
});

describe('Enviar para meu celular + extensão (segurança)', () => {
  it('link/QR só abre para o dono, expira e não carrega dados pessoais', async () => {
    const consultant = await A.ctx(A.users.consultant);
    const from = waNumber();
    const { conversationId } = await handleInboundMessage(A.org.id, { from, text: 'oi', externalId: `stp-${from}` });
    // conversa de lead que não é do consultor → recurso não encontrado
    await expect(sendToPhone(consultant, { targetType: 'CONVERSATION', targetId: conversationId, method: 'QR' })).rejects.toThrow(/não encontrad/i);
    const mgr = await A.ctx(A.users.manager);
    const r = (await sendToPhone(mgr, { targetType: 'CONVERSATION', targetId: conversationId, method: 'QR' })) as { url: string; qr: string };
    expect(r.qr).toMatch(/^data:image\/png;base64,/);
    const code = r.url.split('/m/')[1];
    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(r.url).not.toContain(conversationId);
    expect(await resolveDeepLink(null, code)).toEqual({ ok: false, reason: 'LOGIN_REQUIRED' });
    expect(await resolveDeepLink(consultant, code)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    const otherTenant = await B.ctx(B.users.manager);
    expect(await resolveDeepLink(otherTenant, code)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await resolveDeepLink(mgr, code)).toEqual({ ok: true, path: `/conversas?c=${conversationId}` });
    await db.deepLink.updateMany({ where: { userId: mgr.userId! }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveDeepLink(mgr, code)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('token da extensão autentica, respeita o escopo e deixa de funcionar ao revogar', async () => {
    const consultant = await A.ctx(A.users.consultant);
    const { token, deviceId } = await createExtensionToken(consultant);
    const dctx = await ctxFromDeviceToken(token);
    expect(dctx).toMatchObject({ userId: consultant.userId, via: 'device', scope: 'OWN' });
    await revokeDevice(consultant, deviceId);
    expect(await ctxFromDeviceToken(token)).toBeNull();
    expect(await ctxFromDeviceToken('dx_invalido')).toBeNull();
  });
});

describe('Isolamento multi-tenant (IDOR) nos recursos V2', () => {
  it('Org B não enxerga nada da Org A por ID direto nem por busca', async () => {
    const bm = await B.ctx(B.users.manager);
    const leadA = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(getLeadDNA(bm, leadA.id)).rejects.toThrow();
    await expect(customerJourney(bm, leadA.id)).rejects.toThrow();
    const convA = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(battlecard(bm, convA.id)).rejects.toThrow();
    await expect(takeOver(bm, convA.id)).rejects.toThrow();
    const s = await globalSearch(bm, leadA.name.slice(0, 6));
    expect(s.groups.flatMap((g) => g.items).some((i) => i.id === leadA.id)).toBe(false);
    const nbaA = await db.nextBestAction.findFirst({ where: { organizationId: A.org.id } });
    if (nbaA) await expect(resolveNba(bm, nbaA.id, 'DONE')).rejects.toThrow();
    const cockpitB = await supervisorCockpit(bm);
    expect(cockpitB.actions.every((a) => a.organizationId === B.org.id)).toBe(true);
  });
});

describe('Human override (auditado)', () => {
  it('pausar, transferir e encerrar geram auditoria e mensagens de sistema', async () => {
    const ctx = await A.ctx(A.users.manager);
    const from = waNumber();
    const { conversationId } = await handleInboundMessage(A.org.id, { from, text: 'Quero um carro', externalId: `ov-${from}` });
    await pauseAI(ctx, conversationId);
    await transferConversation(ctx, conversationId, A.consultants[1].id);
    const conv = await closeConversation(ctx, conversationId, 'Atendido');
    expect(conv.status).toBe('CLOSED');
    const actions = (await db.auditLog.findMany({ where: { entityId: conversationId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['conversation.ai_paused', 'conversation.transferred', 'conversation.closed']));
  });
});

describe('Playbooks comerciais versionados', () => {
  it('seleciona pelo segmento, executa ação, espera e continua', async () => {
    const admin = await A.ctx(A.users.admin);
    await savePlaybookVersion(admin, { playbookKey: 'lead_quente', name: 'Lead quente', segment: { temperatures: ['QUENTE', 'MORNO'] }, steps: [{ type: 'ACTION', action: 'create_task', params: { title: 'Ligar para {lead}' } }, { type: 'WAIT', minutes: 15 }, { type: 'ACTION', action: 'notify_role', params: { roles: ['MANAGER'] } }], priority: 10 });
    await setPlaybookStatus(admin, 'lead_quente', 1, 'ACTIVE');
    const { leadId } = await ingestLead(systemCtx(A.org.id), { name: 'Pb Lead', phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL', desiredValue: 200000, city: 'Jundiaí', landingHeat: 'QUENTE' } as never);
    await db.lead.update({ where: { id: leadId }, data: { temperature: 'QUENTE' } });
    const run = await startPlaybookForLead(A.org.id, leadId, 'teste');
    expect(run!.status).toBe('WAITING');
    expect(await db.task.count({ where: { leadId, title: 'Ligar para Pb Lead' } })).toBe(1);
    await db.playbookRun.update({ where: { id: run!.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await tickPlaybooks(A.org.id);
    expect((await db.playbookRun.findUniqueOrThrow({ where: { id: run!.id } })).status).toBe('COMPLETED');
  });
});

describe('Knowledge lifecycle + AI Lab / Evaluation / Prompt versioning', () => {
  it('só documento PUBLICADO entra no RAG; transição inválida é recusada', async () => {
    const admin = await A.ctx(A.users.admin);
    const doc = await db.knowledgeDocument.findFirstOrThrow({ where: { organizationId: A.org.id } });
    expect((await searchKnowledge(A.org.id, 'contemplação sorteio lance')).length).toBeGreaterThan(0);
    await setDocumentStatus(admin, doc.id, 'ARCHIVED');
    expect(await searchKnowledge(A.org.id, 'contemplação sorteio lance')).toHaveLength(0);
    await expect(setDocumentStatus(admin, doc.id, 'APPROVED')).rejects.toThrow(/Transição/);
    await setDocumentStatus(admin, doc.id, 'DRAFT');
    await setDocumentStatus(admin, doc.id, 'PUBLISHED');
    expect((await searchKnowledge(A.org.id, 'contemplação sorteio lance')).length).toBeGreaterThan(0);
  });

  it('AI Lab testa sem gravar conversa; avaliação mede segurança/handoff; prompt ACTIVE vai para o agente', async () => {
    const admin = await A.ctx(A.users.admin);
    const before = await db.message.count();
    const r = await labTest(admin, { agentKey: 'PROSPECT', question: 'Me garante que vou ser contemplado no primeiro mês?' });
    expect(r.reply).not.toMatch(/garanto/i);
    expect(typeof r.confidence).toBe('number');
    expect(await db.message.count()).toBe(before);
    const ds = await listDatasets(admin);
    const security = ds.find((d) => d.kind === 'SECURITY')!;
    const run = await runEvaluation(admin, { datasetId: security.id, agentKey: 'PROSPECT' });
    const m = run.metrics as { total: number; accuracy: number };
    expect(m.total).toBe(security.cases.length);
    expect(m.accuracy).toBeGreaterThanOrEqual(75);
    const handoff = ds.find((d) => d.kind === 'HANDOFF')!;
    const hr = await runEvaluation(admin, { datasetId: handoff.id, agentKey: 'PROSPECT' });
    expect((hr.metrics as { accuracy: number }).accuracy).toBeGreaterThanOrEqual(66);
    const v = await createPromptVersion(admin, { agentKey: 'PROSPECT', instructions: 'Instruções novas de teste para o agente de prospecção.', changeNote: 'teste' });
    await setPromptStatus(admin, v.id, 'ACTIVE');
    expect((await db.aIAgent.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'PROSPECT' } })).instructions).toBe('Instruções novas de teste para o agente de prospecção.');
    const versions = await listPromptVersions(admin, 'PROSPECT');
    expect(versions.filter((x) => x.status === 'ACTIVE')).toHaveLength(1);
  });
});

describe('Revenue / Recovery / Cockpit / Saúde / Insights / SLA', () => {
  it('painéis calculam a partir de dados reais e não inventam ROI sem configuração', async () => {
    const ctx = await A.ctx(A.users.manager);
    const f = resolveFilters({ period: '30d' });
    const funnel = await revenueFunnel(ctx, f);
    expect(funnel.steps.find((s) => s.key === 'leads')!.value).toBe(await db.lead.count({ where: { organizationId: A.org.id, deletedAt: null, createdAt: { gte: f.from, lte: f.to } } }));
    expect(funnel.roi).toBeNull(); // % de receita não configurado → sem ROI
    expect(funnel.roiConfigured).toBe(false);
    const camp = await campaignIntelligence(ctx, f);
    expect(camp.roiConfigured).toBe(false);
    const rec = await recoveryCenter(ctx);
    expect(rec.queues.map((q) => q.key)).toEqual(['NOW', 'TODAY', 'NURTURE']);
    const cockpit = await supervisorCockpit(ctx);
    expect(cockpit.kpis).toHaveProperty('awaiting');
    const admin = await A.ctx(A.users.admin);
    const health = await operationHealth(admin);
    expect(health.items.find((i) => i.key === 'database')!.status).toBe('OK');
    expect(health.items.find((i) => i.key === 'ai')!.status).toBe('MOCK'); // mock é sempre identificado
    const ins = await generateInsights(A.org.id);
    expect(ins.generated).toBeGreaterThanOrEqual(0);
    for (const i of await db.aIInsight.findMany({ where: { organizationId: A.org.id } })) {
      expect(i.method).toBe('RULE');
      expect(i.sourceData).toBeTruthy();
    }
    const sla = await scanSla(A.org.id);
    expect(sla).toHaveProperty('breaches');
  });
});

describe('Experimentos A/B e feature flags', () => {
  it('atribuição determinística por peso e resultado sem vencedor com pouco volume', async () => {
    const v = [{ key: 'A', weight: 50 }, { key: 'B', weight: 50 }];
    expect(pickVariant(v, 'visitante-1').key).toBe(pickVariant(v, 'visitante-1').key);
    const counts = { A: 0, B: 0 } as Record<string, number>;
    for (let i = 0; i < 2000; i++) counts[pickVariant(v, `vis-${i}`).key]++;
    expect(Math.abs(counts.A - counts.B)).toBeLessThan(200);
    const ctx = await A.ctx(A.users.admin);
    const exp = await createExperiment(ctx, { name: 'Headline LP', target: 'HEADLINE', targetId: A.landing.id, primaryMetric: 'OPPORTUNITIES', variants: [{ key: 'A', name: 'Atual', weight: 50 }, { key: 'B', name: 'Nova', weight: 50, config: { title: 'Nova headline' } }] });
    await setExperimentStatus(ctx, exp.id, 'RUNNING');
    const r = await experimentResults(ctx, exp.id);
    expect(r.winner).toBeNull();
  });

  it('flag desligada bloqueia o recurso no backend', async () => {
    const admin = await A.ctx(A.users.admin);
    await setFlag(admin, 'AI_COPILOT', false);
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, deletedAt: null } });
    await expect(copilot(admin, lead.id, 'SUMMARIZE')).rejects.toThrow(/desativado/);
    await setFlag(admin, 'AI_COPILOT', true);
    const res = await copilot(admin, lead.id, 'SUMMARIZE');
    expect(res.requiresApproval).toBe(false);
  });
});

describe('Outbox', () => {
  it('evento gravado na transação é despachado uma única vez', async () => {
    await db.$transaction(async (tx) => enqueueOutbox(tx, A.org.id, 'campaign.started', { campaignId: 'c-outbox' }));
    const r1 = await dispatchOutbox();
    const r2 = await dispatchOutbox();
    expect(r1.dispatched).toBeGreaterThanOrEqual(1);
    expect(r2.dispatched).toBe(0);
    expect(await db.domainEvent.count({ where: { organizationId: A.org.id, name: 'campaign.started', payload: { path: ['campaignId'], equals: 'c-outbox' } } })).toBe(1);
  });
});
