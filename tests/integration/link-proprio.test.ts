import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { getSite, registerInterest, simulateCold, trackSiteVisit } from '@/modules/landing-service/landing-service.service';
import { myLinkStats } from '@/modules/management/dashboards.service';
import { ensureLandingSlug, freeSlug, setLandingSlug, slugify } from '@/modules/consultants/landing-link';
import { ORGANIC_ONLY } from '@/modules/lead-routing/equal-split';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let svc: Ctx;
let slug: string;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Link Próprio');
  const { secret } = await createApiKey(await A.ctx(A.users.admin), 'Landing', ['landing.service']);
  svc = (await ctxFromApiKey(secret))!;
  slug = await ensureLandingSlug(A.consultants[1].id);
}, 120_000);

describe('Link próprio do consultor (página idêntica à mestre)', () => {
  it('gera o link pelo nome, sem acento, e não repete', async () => {
    expect(slugify('Júlia  Conceição')).toBe('julia-conceicao');
    expect(slug).toMatch(/^consultor-dois/);
    expect(await ensureLandingSlug(A.consultants[1].id)).toBe(slug); // estável
    expect(await freeSlug('Consultor Dois')).not.toBe(slug);
  });

  it('a página é a mesma da central: nada do consultor nela', async () => {
    const central = await getSite(svc, 'central');
    const own = await getSite(svc, slug);
    expect(own).toMatchObject({ kind: 'CENTRAL', pj: null, subdomain: slug });
    // Só muda a autorização da marca (consultor novo começa sem autorização; a central sempre tem).
    expect(JSON.stringify({ ...own, subdomain: 'x', brandAuthorized: true })).toBe(JSON.stringify({ ...central, subdomain: 'x' }));
    expect(JSON.stringify(own)).not.toContain('Consultor Dois');
    expect(central.brandAuthorized).toBe(true);
    expect(own.brandAuthorized).toBe(false);
  });

  it('consultor autorizado pela equipe da plataforma passa a ter a marca na página dele', async () => {
    const c = await db.consultant.findFirstOrThrow({ where: { landingSlug: slug } });
    await db.consultant.update({ where: { id: c.id }, data: { brandAuthorized: true } });
    expect((await getSite(svc, slug)).brandAuthorized).toBe(true);
  });

  it('quem deixa contato pelo link vira lead do dono do link (fora da divisão)', async () => {
    const sim = await simulateCold(svc, slug, { product: 'IMOVEL', value: 220000 });
    await registerInterest(svc, slug, { simulationId: sim.simulationId, name: 'Veio Pela Bio', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: true });
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Veio Pela Bio' } });
    expect(lead).toMatchObject({ consultantId: A.consultants[1].id, routingHint: `LINK:${A.consultants[1].id}`, status: 'ASSIGNED' });
    expect((await db.routingDecision.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }))?.method).toBe('CONSULTANT_LINK');
    // não conta na fila do orgânico: a divisão igual continua empatada para os outros
    expect(await db.lead.count({ where: { id: lead.id, ...ORGANIC_ONLY } })).toBe(0);
  });

  it('pela página mestre o lead continua na divisão igual', async () => {
    const sim = await simulateCold(svc, 'central', { product: 'IMOVEL', value: 220000 });
    await registerInterest(svc, 'central', { simulationId: sim.simulationId, name: 'Veio Pela Mestre', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: true });
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Veio Pela Mestre' } });
    expect(lead.routingHint).toBe('CENTRAL');
    expect(await db.lead.count({ where: { id: lead.id, ...ORGANIC_ONLY } })).toBe(1);
  });

  it('não aceita link de unidade, reservado, inválido ou de outro consultor; consultor inativo perde a página', async () => {
    await db.pJ.update({ where: { id: A.pjA.id }, data: { subdomain: 'unidade-x' } });
    await expect(setLandingSlug(A.consultants[0].id, 'unidade-x')).rejects.toThrow(/em uso/);
    await expect(setLandingSlug(A.consultants[0].id, 'central')).rejects.toThrow(/em uso/);
    await expect(setLandingSlug(A.consultants[0].id, 'Com Espaço')).rejects.toThrow(/minúsculas/);
    await expect(setLandingSlug(A.consultants[0].id, slug)).rejects.toThrow(/em uso/);
    expect(await setLandingSlug(A.consultants[0].id, 'consultor-um-novo')).toBe('consultor-um-novo');
    await db.consultant.update({ where: { id: A.consultants[0].id }, data: { active: false } });
    await expect(getSite(svc, 'consultor-um-novo')).rejects.toThrow(/não encontrad/);
  });
});

describe('Quadro "Meu link" do consultor', () => {
  it('conta acessos e simulações do link e lista quem deixou o contato', async () => {
    await db.consultant.update({ where: { id: A.consultants[0].id }, data: { active: true } }); // o teste anterior desativa
    const own = await ensureLandingSlug(A.consultants[0].id);
    const me = await A.ctx(A.users.consultant);
    const before = await myLinkStats(me, 'hoje');
    // 4 pessoas abrem o link, 2 simulam, 1 deixa o contato; acesso à central não conta para ele.
    const v1 = await trackSiteVisit(svc, own, { event: 'PAGE_VIEW' });
    const v2 = await trackSiteVisit(svc, own, { event: 'PAGE_VIEW' });
    await trackSiteVisit(svc, own, { event: 'PAGE_VIEW' });
    await trackSiteVisit(svc, 'central', { event: 'PAGE_VIEW' });
    // Quem já tinha visitado a central e depois abre o link do consultor passa a contar para ele.
    const antes = await trackSiteVisit(svc, 'central', { event: 'PAGE_VIEW' });
    await trackSiteVisit(svc, own, { sessionKey: antes.sessionKey, event: 'PAGE_VIEW' });
    await simulateCold(svc, own, { sessionKey: v1.sessionKey, product: 'IMOVEL', value: 300000 });
    const sim = await simulateCold(svc, own, { sessionKey: v2.sessionKey, product: 'IMOVEL', value: 180000 });
    await registerInterest(svc, own, { simulationId: sim.simulationId, name: 'Cliente do Meu Link', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: true });

    const after = await myLinkStats(me, 'hoje');
    expect(after.visits - before.visits).toBe(4);
    expect(after.simulations - before.simulations).toBe(2);
    expect(after.signups.map((s) => s.lead.name)).toContain('Cliente do Meu Link');
    expect(after.signups.find((s) => s.lead.name === 'Cliente do Meu Link')).toMatchObject({ product: 'IMOVEL', value: 180000 });
  });
});
