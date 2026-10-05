import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { registerInterest, simulateCold, trackSiteVisit } from '@/modules/landing-service/landing-service.service';
import { ensureLandingSlug, masterLandingUrl } from '@/modules/consultants/landing-link';
import {
  codeStats,
  createTrackedLink,
  ensureExampleTemplates,
  EXAMPLE_TEMPLATES,
  myOutreach,
  originOfCode,
  pickDaily,
  saveTemplate,
  setTemplateState,
  teamOutreachReport,
  utmFromShortCode,
} from '@/modules/outreach/outreach.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let admin: Ctx;
let consultor: Ctx; // ligado ao consultants[0]
let svc: Ctx;
let slug: string;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Divulgação');
  admin = await A.ctx(A.users.admin);
  consultor = await A.ctx(A.users.consultant);
  const { secret } = await createApiKey(admin, 'Landing', ['landing.service']);
  svc = (await ctxFromApiKey(secret))!;
  slug = await ensureLandingSlug(A.consultants[0].id);
}, 120_000);

describe('Divulgação: kit do dia, canais e indicação', () => {
  it('consultor já ganha 3 canais prontos; sem modelo aprovado, o kit fica vazio', async () => {
    expect(await ensureExampleTemplates(A.org.id)).toBe(EXAMPLE_TEMPLATES.length);
    const d = await myOutreach(consultor);
    expect(d.channels.map((c) => c.network).sort()).toEqual(['GRUPOS', 'INSTAGRAM', 'WHATSAPP_STATUS']);
    expect(d.channels.every((c) => c.url.includes(`${slug}.`) && /\/\?c=[wig]-[0-9a-f]{10}$/.test(c.url))).toBe(true); // link curto para caber no post
    expect(d.posts).toEqual([]); // exemplos entram NÃO aprovados
    expect((await myOutreach(consultor)).channels).toHaveLength(3); // não duplica
  });

  it('gestão aprova → 3 posts por dia, com o nome do consultor e o {link} para trocar pelo canal', async () => {
    for (const t of await db.postTemplate.findMany({ where: { organizationId: A.org.id } })) await setTemplateState(admin, t.id, { approved: true });
    const d = await myOutreach(consultor);
    expect(d.posts).toHaveLength(3);
    expect(d.posts.every((p) => p.body.includes('{link}') && !p.body.includes('{primeiro_nome}') && p.defaultChannelId)).toBe(true);
  });

  it('código curto inválido é ignorado (não vira UTM)', () => {
    expect(utmFromShortCode('w-459fe3505d')).toEqual({ utm_source: 'whatsapp', utm_medium: 'divulgacao', utm_campaign: 'w-459fe3505d' });
    expect(utmFromShortCode('n-0123456789')?.utm_medium).toBe('indicacao');
    for (const bad of ['x-459fe3505d', 'w-459', "w-459fe3505d' OR 1=1", '', null]) expect(utmFromShortCode(bad)).toBeNull();
  });

  it('o kit muda por dia e por consultor (evita 10 textos iguais no mesmo grupo)', () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    expect(pickDaily(items, 'consultor-a', 100)).toEqual(pickDaily(items, 'consultor-a', 100));
    expect(pickDaily(items, 'consultor-a', 100)).not.toEqual(pickDaily(items, 'consultor-a', 101));
    expect(pickDaily(items, 'consultor-a', 100)).not.toEqual(pickDaily(items, 'consultor-b', 100));
    expect(pickDaily([], 'x')).toEqual([]);
  });

  it('modelo precisa ter {link}; editar o texto tira do kit até aprovar de novo; consultor não mexe em modelo', async () => {
    await expect(saveTemplate(admin, { title: 'Sem link', body: 'Texto sem o link do consultor aqui.' })).rejects.toThrow();
    const t = await db.postTemplate.findFirstOrThrow({ where: { organizationId: A.org.id, approved: true } });
    const saved = await saveTemplate(admin, { title: t.title, network: t.network, body: `${t.body}\nNovo texto.` }, t.id);
    expect(saved.approved).toBe(false);
    await expect(saveTemplate(consultor, { title: 'X', body: 'Texto qualquer com {link} aqui.' })).rejects.toThrow();
  });

  it('indicação: quem chega pelo link vira lead do consultor, marcado com quem indicou', async () => {
    const link = await createTrackedLink(consultor, { kind: 'INDICACAO', name: 'Marcos (cliente)', target: 'MESTRE' });
    expect(link.url).toContain(`${slug}.`); // indicação sempre no link próprio
    expect(link.url.endsWith(`?c=${link.code}`) && link.code.startsWith('n-')).toBe(true);
    // o visitante chega pelo link curto: a landing repassa só o ?c=
    const visit = await trackSiteVisit(svc, slug, { c: link.code, event: 'PAGE_VIEW' });
    const sim = await simulateCold(svc, slug, { sessionKey: visit.sessionKey, product: 'IMOVEL', value: 250000 });
    await registerInterest(svc, slug, { simulationId: sim.simulationId, sessionKey: visit.sessionKey, name: 'Amigo Do Marcos', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: true });
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, utmCampaign: link.code } });
    expect(lead).toMatchObject({ consultantId: A.consultants[0].id, utmCampaign: link.code, medium: 'indicacao' });
    expect(await originOfCode(A.org.id, lead.utmCampaign)).toMatchObject({ kind: 'INDICACAO', name: 'Marcos (cliente)' });
    expect((await codeStats(A.org.id, [link.code])).get(link.code)).toMatchObject({ leads: 1, hot: 1 });
    const mine = await myOutreach(consultor);
    expect(mine.referrals.find((r) => r.code === link.code)?.leads).toBe(1);
  });

  it('canal para o site mestre: o lead entra na divisão, mas a origem continua registrada', async () => {
    const link = await createTrackedLink(consultor, { kind: 'CANAL', name: 'Grupo Brasileiros em Lisboa', network: 'GRUPOS', target: 'MESTRE' });
    expect(link.url.startsWith(masterLandingUrl().replace(/\/$/, ''))).toBe(true);
    const visit = await trackSiteVisit(svc, 'central', { c: link.code, event: 'PAGE_VIEW' });
    const sim = await simulateCold(svc, 'central', { sessionKey: visit.sessionKey, product: 'IMOVEL', value: 250000 });
    await registerInterest(svc, 'central', { simulationId: sim.simulationId, sessionKey: visit.sessionKey, name: 'Visitante De Lisboa', whatsapp: uniquePhone(), consentWhatsapp: true, callNow: true });
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, utmCampaign: link.code } });
    expect(lead).toMatchObject({ routingHint: 'CENTRAL', utmCampaign: link.code, medium: 'divulgacao' });
  });

  it('relatório da gestão soma canais e indicações por consultor; consultor não vê o da equipe', async () => {
    const r = await teamOutreachReport(admin, new Date(Date.now() - 86_400_000));
    const row = r.rows.find((x) => x.id === A.consultants[0].id)!;
    expect(row).toMatchObject({ referralLeads: 1, channelLeads: 1 });
    expect(r.topChannels.map((c) => c.name)).toEqual(expect.arrayContaining(['Marcos (cliente)', 'Grupo Brasileiros em Lisboa']));
    await expect(teamOutreachReport(consultor, new Date(0))).rejects.toThrow();
  });
});
