import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { importTeam, onboardMember, setMemberActive } from '@/modules/team/team.service';
import { ingestLead } from '@/modules/leads/lead-engine';
import { routeLead } from '@/modules/lead-routing/routing.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let admin: Ctx;

/** Cria e distribui N leads que caem na landing da PJ A (divisão igual entre os consultores dela). */
async function leadsToPjA(ctx: Ctx, n: number, tag: string) {
  for (let i = 0; i < n; i++) {
    const { leadId } = await ingestLead(ctx, { name: `${tag} ${i}`, phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL', originPjId: A.pjA.id, landingHeat: 'MORNO' });
    const l = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (!l.consultantId) await routeLead(ctx, leadId);
  }
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Equipe');
  // Cadastro de colaboradores é do Super Admin (equipe da plataforma).
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  const su = await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super Teste', roleId: role.id, passwordHash: 'x' } });
  admin = await A.ctx(su);
}, 120_000);

describe('Equipe (Super Admin): cadastro completo e entrada na divisão igual', () => {
  it('cadastra login + consultor + números de uma vez', async () => {
    const r = await onboardMember(admin, { name: 'ana paula lima', email: 'ana@equipe.test', pjId: A.pjA.id, instagram: '@ana.lima', numbers: ['+55 11 93000-0001', '+1 305 555 0101'] });
    expect(r).toMatchObject({ name: 'Ana Paula Lima', numbers: 2, warning: null });
    expect((await db.consultant.findUniqueOrThrow({ where: { id: r.consultantId } })).instagramUrl).toBe('https://www.instagram.com/ana.lima/');
    expect(r.tempPassword).toBeTruthy();
    const c = await db.consultant.findUniqueOrThrow({ where: { id: r.consultantId }, include: { user: { include: { role: true } }, whatsappNumbers: { orderBy: { priority: 'asc' } } } });
    expect(c.user?.role.key).toBe('CONSULTANT');
    expect(c.whatsappNumbers.map((n) => [n.phone, n.priority, n.status])).toEqual([
      ['5511930000001', 0, 'CONNECTED'],
      ['13055550101', 1, 'CONNECTED'],
    ]);
  });

  it('recusa e-mail ou número repetido sem criar nada pela metade', async () => {
    await expect(onboardMember(admin, { name: 'Outra Pessoa', email: 'ana@equipe.test', pjId: A.pjA.id, numbers: ['+55 11 93000-0009'] })).rejects.toThrow(/e-mail/);
    await expect(onboardMember(admin, { name: 'Outra Pessoa', email: 'outra@equipe.test', pjId: A.pjA.id, numbers: ['+55 11 93000-0001'] })).rejects.toThrow(/já cadastrado/);
    expect(await db.consultant.count({ where: { email: 'outra@equipe.test' } })).toBe(0);
  });

  it('quem entra no meio do mês recebe em partes iguais a partir dali (não leva todos os próximos)', async () => {
    // Equipe atual da PJ A recebe 6 leads (3 cada entre os dois consultores antigos + Ana).
    await leadsToPjA(admin, 6, 'Antes');
    const novo = await onboardMember(admin, { name: 'Bruno Novo', email: 'bruno@equipe.test', pjId: A.pjA.id, numbers: ['+55 11 93000-0002', '+55 11 93000-0003'] });
    expect(novo.baseline).toBeGreaterThan(0);
    await leadsToPjA(admin, 8, 'Depois');
    const depois = await db.lead.groupBy({ by: ['consultantId'], where: { organizationId: A.org.id, name: { startsWith: 'Depois' } }, _count: { _all: true } });
    const counts = depois.map((d) => d._count._all);
    expect(depois.find((d) => d.consultantId === novo.consultantId)?._count._all).toBe(2); // 8 leads ÷ 4 pessoas
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('desligar tira da divisão e do acesso; religar volta empatado', async () => {
    const bruno = await db.consultant.findFirstOrThrow({ where: { email: 'bruno@equipe.test' }, include: { user: true } });
    await setMemberActive(admin, bruno.id, false);
    expect((await db.user.findUniqueOrThrow({ where: { id: bruno.user!.id } })).status).toBe('DISABLED');
    await leadsToPjA(admin, 3, 'Fora');
    expect(await db.lead.count({ where: { name: { startsWith: 'Fora' }, consultantId: bruno.id } })).toBe(0);
    await setMemberActive(admin, bruno.id, true);
    expect((await db.user.findUniqueOrThrow({ where: { id: bruno.user!.id } })).status).toBe('ACTIVE');
  });

  it('planilha: cadastra várias pessoas e informa erro por linha', async () => {
    const csv = 'nome;email;unidade;instagram;whatsapp1;whatsapp2\nCarla Dias;carla@equipe.test;PJA;instagram.com/carla.dias;+55 11 93000-0010;+55 11 93000-0011\nDiego Reis;diego@equipe.test;PJX;;+55 11 93000-0012;\nEva Luz;eva@equipe.test;PJB;;+55 11 93000-0013;\n';
    const r = await importTeam(admin, csv);
    expect(r).toMatchObject({ total: 3, created: 2 });
    expect(r.results[1]).toMatchObject({ ok: false, error: expect.stringContaining('PJX') });
    expect(r.results[2]).toMatchObject({ ok: true, warning: expect.stringContaining('backup') });
  });

  it('só o Super Admin cadastra: Admin do cliente e consultor não', async () => {
    for (const u of [A.users.admin, A.users.consultant]) {
      await expect(onboardMember(await A.ctx(u), { name: 'Intruso', email: 'x@equipe.test', pjId: A.pjA.id, numbers: ['+55 11 93000-0099'] })).rejects.toThrow(/Super Admin/);
    }
  });

  it('1 a 7 números: sem número é recusado; com 1 avisa que fica sem backup', async () => {
    await expect(onboardMember(admin, { name: 'Sem Numero', email: 'sem@equipe.test', pjId: A.pjA.id, numbers: [] })).rejects.toThrow();
    const r = await onboardMember(admin, { name: 'Um Numero', email: 'um@equipe.test', pjId: A.pjA.id, numbers: ['+55 11 93000-0050'] });
    expect(r.warning).toMatch(/sem backup/);
    const eight = Array.from({ length: 8 }, (_, i) => `+55 11 93100-00${10 + i}`);
    await expect(onboardMember(admin, { name: 'Oito Numeros', email: 'oito@equipe.test', pjId: A.pjA.id, numbers: eight })).rejects.toThrow();
  });
});
