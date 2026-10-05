import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { getSite, listSites, registerInterest, simulateCold, trackSiteVisit } from '@/modules/landing-service/landing-service.service';
import { landingReport } from '@/modules/landing-service/landing-report.service';
import { can } from '@/modules/auth/context';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let B: Org;
let svc: Ctx; // contexto do serviço de landing (API key com permissão landing.service)
const SUB = `pja-${Date.now().toString(36)}`;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Landing A');
  B = await createOrg('Org Landing B');
  await db.pJ.update({ where: { id: A.pjA.id }, data: { subdomain: SUB, landingActive: true, landingSimulatorId: A.simulator.id } });
  const admin = await A.ctx(A.users.admin);
  const { secret } = await createApiKey(admin, 'Landing', ['landing.service']);
  svc = (await ctxFromApiKey(secret))!;
}, 120_000);

describe('Serviço de landing das PJs', () => {
  it('a chave do serviço só tem a permissão landing.service', () => {
    expect(can(svc, 'landing.service')).toBe(true);
    expect(can(svc, 'lead.read')).toBe(false);
  });

  it('entrega o site da PJ pelo subdomínio (e não de outra organização)', async () => {
    const site = await getSite(svc, SUB);
    expect(site.pj?.code).toBe('PJA');
    expect(site.simulator.products.length).toBeGreaterThan(0);
    const other = await createApiKey(await B.ctx(B.users.admin), 'Landing B', ['landing.service']);
    await expect(getSite((await ctxFromApiKey(other.secret))!, SUB)).rejects.toThrow(/não encontrad/);
  });

  it('FRIO: só simular grava a simulação sem criar lead', async () => {
    const leadsBefore = await db.lead.count({ where: { organizationId: A.org.id } });
    const visit = await trackSiteVisit(svc, SUB, { referrer: 'https://www.google.com.br/', event: 'PAGE_VIEW' });
    expect(visit.channel).toBe('GOOGLE_ORGANIC');
    const sim = await simulateCold(svc, SUB, { sessionKey: visit.sessionKey, product: 'IMOVEL', value: 300000 });
    expect(sim.heat).toBe('FRIO');
    expect(sim.result.options[0].basis).toBe('DIVISAO_SIMPLES');
    const row = await db.simulation.findUniqueOrThrow({ where: { id: sim.simulationId } });
    expect(row).toMatchObject({ heat: 'FRIO', leadId: null, pjId: A.pjA.id, channel: 'GOOGLE_ORGANIC' });
    expect(await db.lead.count({ where: { organizationId: A.org.id } })).toBe(leadsBefore);
  });

  it('MORNO: deixou contato → lead da PJ, distribuído só entre consultores dela, tarefa de contato', async () => {
    const visit = await trackSiteVisit(svc, SUB, { gclid: 'teste-gclid', event: 'PAGE_VIEW' });
    const sim = await simulateCold(svc, SUB, { sessionKey: visit.sessionKey, product: 'IMOVEL', value: 250000 });
    const res = await registerInterest(svc, SUB, { simulationId: sim.simulationId, name: 'Morno Teste', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: false });
    expect(res.heat).toBe('MORNO');
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Morno Teste' }, include: { consultant: true, tasks: true } });
    expect(lead).toMatchObject({ landingHeat: 'MORNO', originPjId: A.pjA.id, source: 'GOOGLE_ADS', status: 'ASSIGNED' });
    expect(lead.consultant?.pjId).toBe(A.pjA.id);
    expect(lead.tasks.map((t) => [t.type, t.priority])).toEqual([['CONTACT', 'MEDIUM']]);
    expect((await db.routingDecision.findFirstOrThrow({ where: { leadId: lead.id } })).ruleName).toBe('Landing da PJ');
    expect(await db.consent.count({ where: { leadId: lead.id, channel: 'WHATSAPP', status: 'GRANTED' } })).toBe(1);
  });

  it('QUENTE: pediu para ser chamado agora → tarefa urgente; lead existente sobe de morno para quente', async () => {
    const phone = uniquePhone();
    const s1 = await simulateCold(svc, SUB, { product: 'IMOVEL', value: 200000 });
    await registerInterest(svc, SUB, { simulationId: s1.simulationId, name: 'Quente Teste', whatsapp: phone, consentWhatsapp: true });
    const s2 = await simulateCold(svc, SUB, { product: 'IMOVEL', value: 220000 });
    const res = await registerInterest(svc, SUB, { simulationId: s2.simulationId, name: 'Quente Teste', whatsapp: phone, consentWhatsapp: true, callNow: true });
    expect(res.heat).toBe('QUENTE');
    const leads = await db.lead.findMany({ where: { organizationId: A.org.id, name: 'Quente Teste' }, include: { tasks: true } });
    expect(leads).toHaveLength(1); // deduplicado
    expect(leads[0].landingHeat).toBe('QUENTE');
    expect(leads[0].tasks.some((t) => t.type === 'CALLBACK' && t.priority === 'URGENT')).toBe(true);
  });

  it('sem autorização de contato não cria lead', async () => {
    const sim = await simulateCold(svc, SUB, { product: 'IMOVEL', value: 180000 });
    await expect(registerInterest(svc, SUB, { simulationId: sim.simulationId, name: 'Sem Consentimento', whatsapp: uniquePhone(), consentWhatsapp: false })).rejects.toThrow();
    expect(await db.lead.count({ where: { name: 'Sem Consentimento' } })).toBe(0);
  });

  it('contatos da unidade no site, lista de unidades e cliques no WhatsApp', async () => {
    await db.pJ.update({ where: { id: A.pjA.id }, data: { whatsapp: '5500000000000', phone: '550000000000' } });
    const site = await getSite(svc, SUB);
    expect(site.contact).toMatchObject({ whatsapp: '5500000000000', phone: '550000000000' });
    const { units } = await listSites(svc);
    expect(units.map((u) => u.subdomain)).toContain(SUB);
    const visit = await trackSiteVisit(svc, SUB, { event: 'PAGE_VIEW' });
    await trackSiteVisit(svc, SUB, { sessionKey: visit.sessionKey, event: 'WHATSAPP_CLICK' });
    const r = await landingReport(await A.ctx(A.users.manager), { from: new Date(Date.now() - 86400_000), to: new Date(Date.now() + 60_000) });
    expect(r.byPj.find((p) => p.code === 'PJA')!.whatsappClicks).toBe(1);
  });

  it('relatório: funil da PJ e Google orgânico x pago', async () => {
    const ctx = await A.ctx(A.users.manager);
    const r = await landingReport(ctx, { from: new Date(Date.now() - 86400_000), to: new Date(Date.now() + 60_000) });
    const pj = r.byPj.find((p) => p.code === 'PJA')!;
    expect(pj).toMatchObject({ simulations: 5, frio: 2, morno: 1, quente: 1 });
    expect(r.google.find((g) => g.channel === 'GOOGLE_ORGANIC')!.visits).toBe(1);
    expect(r.google.find((g) => g.channel === 'GOOGLE_ADS')!.leads).toBe(1);
  });
});
