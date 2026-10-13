import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { hashPassword } from '@/modules/auth/auth.service';
import { listLeads } from '@/modules/leads/leads.service';
import { listOpportunities } from '@/modules/opportunities/opportunity.service';
import { listOpenNba } from '@/modules/lead-intelligence/intelligence-v2.service';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { leadFilterWhere, oppFilterWhere, resolveFilters } from '@/modules/analytics/filters';
import { parseSpec, runReport } from '@/modules/reports/report.service';
import { recoveryCenter } from '@/modules/recovery/recovery.service';
import { createTask } from '@/modules/tasks/task.service';
import { saveUser } from '@/modules/users/user.service';
import { auditDenied } from '@/modules/audit/audit.service';
import type { Ctx } from '@/modules/auth/context';

// Regressão da auditoria de segurança (2026-10-13): ninguém sai do próprio escopo por filtro, ID ou campo extra.
type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let admin: Ctx;
let consultor: Ctx; // consultants[0], PJ A
let pjManager: Ctx; // PJ B
let leadDoOutro: string; // consultants[1], PJ A

const old = new Date(Date.now() - 10 * 86_400_000);
const mkLead = (consultantId: string, pjId: string, name: string) =>
  db.lead.create({ data: { organizationId: A.org.id, name, phone: uniquePhone(), consultantId, pjId, status: 'ASSIGNED', source: 'OTHER', assignedAt: old } });

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Segurança');
  admin = await A.ctx(A.users.admin);
  consultor = await A.ctx(A.users.consultant);
  pjManager = await A.ctx(A.users.pjManager);
  await mkLead(A.consultants[0].id, A.pjA.id, 'Lead Meu');
  leadDoOutro = (await mkLead(A.consultants[1].id, A.pjA.id, 'Lead Do Outro')).id;
  await mkLead(A.consultants[2].id, A.pjB.id, 'Lead Da PJ B');
  // "esquecidos" no Recovery: sem interação há mais de 3 dias
  await db.$executeRaw`UPDATE "Lead" SET "updatedAt" = ${old} WHERE "organizationId" = ${A.org.id}`;
}, 120_000);

describe('Segurança: escopo de dados e permissões', () => {
  it('consultor não lista leads de outro consultor usando o filtro consultantId', async () => {
    const r = await listLeads(consultor, { consultantId: A.consultants[1].id });
    expect(r.items.map((l) => l.name)).toEqual(['Lead Meu']);
    expect(leadFilterWhere(consultor, { ...resolveFilters({}), consultantId: A.consultants[1].id }).consultantId).toBe(A.consultants[0].id);
    expect(oppFilterWhere(consultor, { ...resolveFilters({}), consultantId: A.consultants[1].id }).consultantId).toBe(A.consultants[0].id);
    expect((await listOpportunities(consultor, { consultantId: A.consultants[1].id })).items.every((o) => o.consultantId === A.consultants[0].id)).toBe(true);
    expect((await listOpenNba(consultor, { consultantId: A.consultants[1].id })).every((n) => n.lead?.name === 'Lead Meu')).toBe(true);
  });

  it('gestor de PJ não enxerga outra PJ usando o filtro pjId', async () => {
    const r = await listLeads(pjManager, { pjId: A.pjA.id });
    expect(r.items.map((l) => l.name)).toEqual(['Lead Da PJ B']);
    expect(leadFilterWhere(pjManager, { ...resolveFilters({}), pjId: A.pjA.id }).pjId).toBe(A.pjB.id);
    expect((await listConsultants(pjManager, { pjId: A.pjA.id })).map((c) => c.id)).toEqual([A.consultants[2].id]);
    expect((await runReport(pjManager, parseSpec({ entity: 'LEADS', pjId: A.pjA.id }))).total).toBe(1);
    expect((await runReport(admin, parseSpec({ entity: 'LEADS', pjId: A.pjA.id }))).total).toBe(2);
  });

  it('gestão continua filtrando por consultor e por PJ', async () => {
    expect((await listLeads(admin, { consultantId: A.consultants[1].id })).items.map((l) => l.name)).toEqual(['Lead Do Outro']);
    expect((await listLeads(admin, { pjId: A.pjB.id })).items.map((l) => l.name)).toEqual(['Lead Da PJ B']);
  });

  it('Recovery: consultor só recebe os próprios leads esquecidos', async () => {
    const mine = JSON.stringify(await recoveryCenter(consultor));
    expect(mine).toContain('Lead Meu');
    expect(mine).not.toContain('Lead Do Outro');
    expect(mine).not.toContain('Lead Da PJ B');
    expect(JSON.stringify(await recoveryCenter(admin))).toContain('Lead Do Outro');
  });

  it('consultor não cria tarefa em lead alheio nem para outro consultor', async () => {
    const base = { type: 'CONTACT', title: 'Tarefa de teste', dueAt: new Date(Date.now() + 3_600_000) };
    await expect(createTask(consultor, { ...base, leadId: leadDoOutro })).rejects.toThrow();
    const t = await createTask(consultor, { ...base, consultantId: A.consultants[1].id });
    expect(t.consultantId).toBe(A.consultants[0].id);
    expect((await createTask(admin, { ...base, consultantId: A.consultants[1].id })).consultantId).toBe(A.consultants[1].id);
  });

  it('lista de consultores não devolve tokens de Instagram/Google', async () => {
    await db.consultant.update({ where: { id: A.consultants[0].id }, data: { instagramTokenEnc: 'x', googleCalendarTokenEnc: 'y' } });
    expect(JSON.stringify(await listConsultants(admin))).not.toMatch(/TokenEnc/);
  });

  it('Admin não altera conta de Super Admin; vínculos precisam ser da organização', async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
    const sa = await db.user.create({ data: { organizationId: A.org.id, email: `sa-${Date.now()}@t.test`, name: 'Super Teste', roleId: role.id, passwordHash: await hashPassword('Teste@123') } });
    await expect(saveUser(admin, { name: sa.name, email: sa.email, roleKey: 'AUDITOR', status: 'ACTIVE' }, sa.id)).rejects.toThrow(/Super Admin/);
    await expect(saveUser(admin, { name: sa.name, email: sa.email, roleKey: 'AUDITOR', status: 'DISABLED' }, sa.id)).rejects.toThrow(/Super Admin/);
    expect((await db.user.findUniqueOrThrow({ where: { id: sa.id } })).roleId).toBe(role.id);
    await expect(saveUser(admin, { name: 'Novo Gestor', email: `g-${Date.now()}@t.test`, roleKey: 'PJ_MANAGER', pjId: 'pj-de-outra-org' })).rejects.toThrow(/PJ inválida/);
  });

  it('acesso negado fica na auditoria e a 5ª tentativa alerta o Super Admin', async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
    const sa = await db.user.findFirstOrThrow({ where: { organizationId: A.org.id, roleId: role.id } });
    for (let i = 0; i < 5; i++) await auditDenied(consultor, { method: 'POST', path: '/api/v1/users', reason: 'Permissão necessária: user.manage' });
    expect(await db.auditLog.count({ where: { organizationId: A.org.id, userId: consultor.userId, action: 'auth.denied' } })).toBe(5);
    expect(await db.notification.count({ where: { userId: sa.id, type: 'security.denied' } })).toBe(1);
  });
});
