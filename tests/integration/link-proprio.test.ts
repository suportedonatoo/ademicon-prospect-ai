import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { getSite, registerInterest, simulateCold } from '@/modules/landing-service/landing-service.service';
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
    expect(JSON.stringify({ ...own, subdomain: 'x' })).toBe(JSON.stringify({ ...central, subdomain: 'x' }));
    expect(JSON.stringify(own)).not.toContain('Consultor Dois');
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
