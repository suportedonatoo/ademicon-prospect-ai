import { db } from '@/lib/db';
import { PERMISSIONS, SYSTEM_ROLES, ROLE_KEYS, type RoleKey } from '@/modules/roles/permissions';
import { buildUserCtx, hashPassword } from '@/modules/auth/auth.service';
import { ensureDefaultPipeline } from '@/modules/pipelines/pipeline.service';
import { ensureCategories, indexDocument } from '@/modules/knowledge-base/knowledge.service';
import { DEFAULT_AGENTS, DEFAULT_PLAYBOOKS } from '@/modules/ai/agents';

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await db.permission.createMany({ data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description, module: key.split('.')[0] })) });
}

/** Cria uma organização mínima e completa para testes. */
export async function createOrg(name = 'Org Teste') {
  const org = await db.organization.create({ data: { name, slug: `org-${uid()}` } });
  const perms = await db.permission.findMany();
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) {
    const role = await db.role.create({ data: { organizationId: org.id, key, name: SYSTEM_ROLES[key].name } });
    await db.rolePermission.createMany({ data: SYSTEM_ROLES[key].permissions.map((p) => ({ roleId: role.id, permissionId: perms.find((x) => x.key === p)!.id })) });
    roles[key] = role.id;
  }
  const region = await db.region.create({ data: { organizationId: org.id, name: 'Jundiaí e Região', ufs: ['SP'], cities: ['Jundiaí', 'Itupeva'] } });
  const pjA = await db.pJ.create({ data: { organizationId: org.id, code: 'PJA', name: 'PJ A', city: 'Jundiaí', uf: 'SP', regionId: region.id, citiesServed: ['Jundiaí'] } });
  const pjB = await db.pJ.create({ data: { organizationId: org.id, code: 'PJB', name: 'PJ B', city: 'Campinas', uf: 'SP', citiesServed: ['Campinas'] } });
  const c1 = await db.consultant.create({ data: { organizationId: org.id, pjId: pjA.id, name: 'Consultor Um', email: `c1-${uid()}@t.test`, products: ['IMOVEL'] } });
  const c2 = await db.consultant.create({ data: { organizationId: org.id, pjId: pjA.id, name: 'Consultor Dois', email: `c2-${uid()}@t.test`, products: ['IMOVEL', 'VEICULO'] } });
  const c3 = await db.consultant.create({ data: { organizationId: org.id, pjId: pjB.id, name: 'Consultor Três', email: `c3-${uid()}@t.test`, products: [] } });
  const pass = await hashPassword('Teste@123');
  const mkUser = async (role: RoleKey, extra: { pjId?: string; consultantId?: string } = {}) =>
    db.user.create({ data: { organizationId: org.id, email: `${role.toLowerCase()}-${uid()}@t.test`, name: `${role} Teste`, roleId: roles[role], passwordHash: pass, ...extra } });
  const users = {
    admin: await mkUser('ADMIN'),
    manager: await mkUser('MANAGER'),
    pjManager: await mkUser('PJ_MANAGER', { pjId: pjB.id }),
    consultant: await mkUser('CONSULTANT', { pjId: pjA.id, consultantId: c1.id }),
    auditor: await mkUser('AUDITOR'),
  };
  await ensureDefaultPipeline(org.id);
  await db.aIAgent.createMany({ data: DEFAULT_AGENTS.map((a) => ({ organizationId: org.id, ...a })) });
  await db.aIPlaybook.createMany({ data: DEFAULT_PLAYBOOKS.map((p) => ({ organizationId: org.id, ...p, rules: [...p.rules] })) });
  await ensureCategories(org.id);
  const cat = await db.knowledgeCategory.findFirstOrThrow({ where: { organizationId: org.id, key: 'CONSORCIO' } });
  const doc = await db.knowledgeDocument.create({
    data: {
      organizationId: org.id,
      categoryId: cat.id,
      title: 'Contemplação: sorteio e lance',
      source: 'teste',
      ownerName: 'Teste',
      status: 'PUBLISHED',
      versions: { create: { organizationId: org.id, version: 1, content: 'A contemplação acontece nas assembleias mensais, por sorteio ou por lance.\n\nNão existe data garantida de contemplação.' } },
    },
  });
  await indexDocument(org.id, doc.id);
  const account = await db.whatsAppAccount.create({ data: { organizationId: org.id, name: 'Conta', provider: 'mock' } });
  await db.whatsAppNumber.create({ data: { organizationId: org.id, accountId: account.id, name: 'Bot', phone: `55119400${String(counter).padStart(5, '0')}`, purpose: 'PROSPECT_BOT', status: 'CONNECTED', dailyLimit: 1000 } });
  const simulator = await db.simulator.create({
    data: {
      organizationId: org.id,
      name: 'Sim',
      slug: `sim-${uid()}`,
      products: [{ key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180], minValue: 50000, maxValue: 1000000 }],
      requiredFields: ['product', 'value', 'name', 'whatsapp', 'city'],
      disclaimer: 'Simulação ilustrativa.',
    },
  });
  const landing = await db.landingPage.create({ data: { organizationId: org.id, name: 'LP', slug: `lp-${uid()}`, title: 'LP de teste', simulatorId: simulator.id, status: 'PUBLISHED', product: 'IMOVEL' } });
  await db.routingRule.create({ data: { organizationId: org.id, name: 'Imóveis Jundiaí', priority: 10, conditions: { products: ['IMOVEL'], regionIds: [region.id] }, pjIds: [pjA.id], method: 'ROUND_ROBIN' } });
  const ctx = async (u: { id: string }) => (await buildUserCtx(u.id))!;
  return { org, region, pjA, pjB, consultants: [c1, c2, c3], users, simulator, landing, ctx };
}

export const uniquePhone = () => `(11) 9${String(Math.floor(1000 + Math.random() * 8999))}-${String(Math.floor(1000 + Math.random() * 8999))}`;
