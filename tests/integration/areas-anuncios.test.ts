import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { ingestLead } from '@/modules/leads/lead-engine';
import { listSponsoredAds, saveSponsoredAd } from '@/modules/management/sponsored-ads.service';
import { adminOverview, consultantDashboard } from '@/modules/management/dashboards.service';
import { convertProspect, listProspects, searchBusinesses } from '@/modules/business-prospecting/prospecting.service';
import { homeFor, navFor } from '@/components/nav';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let admin: Ctx;
const extra: string[] = [];

/** Lead que chega com interesse (qualificado) pelo link de um anúncio (utm_campaign) ou orgânico. */
async function lead(name: string, utmCampaign?: string) {
  const { leadId } = await ingestLead(admin, { name, phone: uniquePhone(), source: utmCampaign ? 'META' : 'GOOGLE_ORGANIC', product: 'IMOVEL', requestedContact: true, routingHint: 'CENTRAL', utm: utmCampaign ? { campaign: utmCampaign } : null });
  return db.lead.findUniqueOrThrow({ where: { id: leadId } });
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Areas');
  admin = await A.ctx(A.users.admin);
  // mais 3 consultores na PJ A (total 5 na PJ A + 1 na PJ B)
  for (const n of ['Quatro', 'Cinco', 'Seis']) extra.push((await db.consultant.create({ data: { organizationId: A.org.id, pjId: A.pjA.id, name: `Consultor ${n}`, email: `${n}@t.test`, products: [] } })).id);
}, 120_000);

describe('Anúncios patrocinados', () => {
  it('individual: todos os leads do anúncio vão para quem pagou', async () => {
    const ad = await saveSponsoredAd(admin, { name: 'Anúncio da Ana', source: 'META', consultantIds: [A.consultants[1].id] });
    expect(ad.link).toContain(`utm_campaign=${ad.utmCampaign}`);
    for (let i = 0; i < 3; i++) {
      const l = await lead(`Individual ${i}`, ad.utmCampaign!);
      expect(l).toMatchObject({ campaignId: ad.id, consultantId: A.consultants[1].id });
    }
  });

  it('grupo: divisão igual só entre quem pagou (consultores 1 a 3 de 6)', async () => {
    const group = [A.consultants[0].id, extra[0], extra[1]];
    const ad = await saveSponsoredAd(admin, { name: 'Grupo outubro', source: 'GOOGLE_ADS', externalId: '555000', consultantIds: group });
    for (let i = 0; i < 6; i++) await lead(`Grupo ${i}`, ad.utmCampaign!);
    const leads = await db.lead.findMany({ where: { campaignId: ad.id } });
    expect(leads.every((l) => group.includes(l.consultantId!))).toBe(true);
    for (const g of group) expect(leads.filter((l) => l.consultantId === g)).toHaveLength(2);
    // formulário do Google com o ID da campanha também cai no grupo
    const form = await lead('Formulário Google', '555000');
    expect(form.campaignId).toBe(ad.id);
    expect(group).toContain(form.consultantId);
    const decision = await db.routingDecision.findFirstOrThrow({ where: { leadId: form.id } });
    expect(decision.ruleName).toBe('Anúncio: Grupo outubro');
  });

  it('orgânico continua dividido entre todos', async () => {
    const before = await db.lead.groupBy({ by: ['consultantId'], where: { organizationId: A.org.id, campaignId: null }, _count: { _all: true } });
    expect(before).toHaveLength(0);
    for (let i = 0; i < 6; i++) await lead(`Orgânico ${i}`);
    const org = await db.lead.findMany({ where: { organizationId: A.org.id, name: { startsWith: 'Orgânico' } } });
    expect(org.every((l) => l.consultantId && l.campaignId === null)).toBe(true);
    expect(new Set(org.map((l) => l.pjId)).size).toBe(2); // as duas PJs recebem
  });

  it('patrocinador indisponível fica fora da vez; se ninguém puder, recebe mesmo assim (pagou)', async () => {
    const ad = await saveSponsoredAd(admin, { name: 'Dupla', source: 'META', consultantIds: [extra[2], A.consultants[2].id] });
    await db.consultant.update({ where: { id: extra[2] }, data: { available: false } });
    for (let i = 0; i < 2; i++) expect((await lead(`Dupla ${i}`, ad.utmCampaign!)).consultantId).toBe(A.consultants[2].id);
    await db.consultant.update({ where: { id: A.consultants[2].id }, data: { available: false } });
    expect([extra[2], A.consultants[2].id]).toContain((await lead('Dupla sem ninguém', ad.utmCampaign!)).consultantId);
  });

  it('relatório por patrocinador e visão do consultor (só os anúncios dele)', async () => {
    const all = await listSponsoredAds(admin);
    const grupo = all.find((a) => a.name === 'Grupo outubro')!;
    expect(grupo).toMatchObject({ kind: 'GRUPO', leads: 7 });
    expect(grupo.sponsors.map((s) => s.leads).sort()).toEqual([2, 2, 3]);
    const consultor = await A.ctx(A.users.consultant); // Consultor Um (está no grupo)
    const mine = await listSponsoredAds(consultor);
    expect(mine.map((a) => a.name)).toEqual(['Grupo outubro']);
  });

  it('só a gestão cadastra anúncio', async () => {
    await expect(saveSponsoredAd(await A.ctx(A.users.consultant), { name: 'X', source: 'META', consultantIds: [A.consultants[0].id] })).rejects.toThrow();
    await expect(saveSponsoredAd(admin, { name: 'Sem ninguém', source: 'META', consultantIds: [] })).rejects.toThrow(/pelo menos 1/);
  });
});

describe('Painéis', () => {
  it('Admin: totais, origem e desempenho por consultor', async () => {
    const o = await adminOverview(admin, 'mes');
    expect(o.leads.total).toBeGreaterThanOrEqual(19);
    expect(o.origin.individual).toBe(3);
    expect(o.origin.grupo).toBe(10); // Grupo outubro (7) + Dupla (3)
    expect(o.origin.organico).toBe(6);
    expect(o.consultants.reduce((n, c) => n + c.received, 0)).toBe(o.leads.total);
  });

  it('Consultor: só os leads dele, separados por temperatura, com CVR', async () => {
    const consultor = await A.ctx(A.users.consultant);
    const d = await consultantDashboard(consultor, 'mes');
    const mine = await db.lead.count({ where: { consultantId: A.consultants[0].id } });
    expect(d.received).toBe(mine);
    expect(d.hot.length + d.warm.length + d.cold.length).toBe(d.open);
    expect(d.cvr).toBe(0);
    await expect(adminOverview(consultor, 'mes')).rejects.toThrow();
  });

  it('tempo de resposta (mediana até a 1ª mensagem do consultor) e parte do investimento', async () => {
    const l = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, consultantId: A.consultants[1].id }, orderBy: { assignedAt: 'asc' } });
    const conv = await db.conversation.create({ data: { organizationId: A.org.id, leadId: l.id, channel: 'WHATSAPP', assignedConsultantId: A.consultants[1].id } });
    await db.message.create({ data: { organizationId: A.org.id, conversationId: conv.id, direction: 'OUTBOUND', senderType: 'HUMAN', content: 'Oi!', createdAt: new Date(l.assignedAt!.getTime() + 12 * 60_000) } });
    const o = await adminOverview(admin, 'mes');
    expect(Math.round(o.consultants.find((c) => c.id === A.consultants[1].id)!.responseMin!)).toBe(12);
    expect(o.consultants.find((c) => c.id === extra[0])!.responseMin).toBeNull();
    const ad = await saveSponsoredAd(admin, { name: 'Verba 900', source: 'META', budget: 900, consultantIds: [extra[0], extra[1], A.consultants[0].id] });
    const listed = (await listSponsoredAds(admin)).find((a) => a.id === ad.id)!;
    expect(listed).toMatchObject({ sharePerSponsor: 300, shareFromBudget: true });
  });

  it('cada área tem seu menu e sua página inicial', () => {
    expect(homeFor('SUPER_ADMIN', new Set())).toBe('/superadmin');
    expect(homeFor('ADMIN', new Set())).toBe('/gestao');
    expect(homeFor('CONSULTANT', new Set())).toBe('/meu-painel');
    expect(navFor('CONSULTANT', false).flatMap((g) => g.items.map((i) => i.href))).toEqual(expect.arrayContaining(['/meu-painel', '/conversas', '/empresas', '/treinamento']));
    expect(navFor('ADMIN', false).flatMap((g) => g.items.map((i) => i.href))).toEqual(expect.arrayContaining(['/gestao', '/gestao/anuncios']));
  });
});

describe('Consultor prospecta no Google', () => {
  it('busca, vê só as dele e a empresa convertida vira lead DELE', async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'CONSULTANT' } });
    const perms = await db.permission.findMany({ where: { key: { in: ['prospecting.read', 'prospecting.search', 'prospecting.convert'] } } });
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    const consultor = await A.ctx(A.users.consultant);
    const r = await searchBusinesses(consultor, { provider: 'google_maps', category: 'padaria', city: 'Jundiaí', uf: 'SP', limit: 5 });
    expect(r.added).toBeGreaterThan(0);
    await searchBusinesses(admin, { provider: 'google_maps', category: 'oficina', city: 'Campinas', uf: 'SP', limit: 5 });
    const mine = await listProspects(consultor);
    expect(mine.items.every((p) => p.category === 'padaria')).toBe(true);
    const res = await convertProspect(consultor, mine.items[0].id);
    expect((await db.lead.findUniqueOrThrow({ where: { id: res.leadId } })).consultantId).toBe(A.consultants[0].id);
  });
});
