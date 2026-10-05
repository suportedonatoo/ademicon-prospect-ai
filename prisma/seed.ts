// Seed de demonstração — TODOS os dados são fictícios.
// Uso: npm run db:seed   (recria os dados da organização demo)

process.env.QUEUE_DRIVER = 'inline'; // o seed executa o fluxo real de forma síncrona

import crypto from 'node:crypto';
import { fakerPT_BR as faker } from '@faker-js/faker';

// Marca pública: uso da marca Ademicon autorizado pela operação (logo/fotos oficiais são fornecidos por eles).
const PUBLIC_BRAND = { name: 'Ademicon', tagline: 'Consórcio com atendimento na sua região', privacyUrl: null };
const PJ_MANAGERS = ['Marcos Ribeiro', 'Tatiane Lopes', 'Paula Siqueira', 'Rodrigo Nunes', 'Aline Castro', 'Fábio Moura', 'Juliana Prates', 'Ricardo Sales', 'Camila Duarte', 'Eduardo Pires'];

async function main() {
  if (process.env.APP_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Seed bloqueado em produção. Defina SEED_ALLOW_PRODUCTION=1 se realmente quiser.');
  }
  const { db } = await import('../src/lib/db');
  const { hashPassword } = await import('../src/modules/auth/auth.service');
  const { PERMISSIONS, SYSTEM_ROLES, ROLE_KEYS } = await import('../src/modules/roles/permissions');
  const { ensureDefaultPipeline } = await import('../src/modules/pipelines/pipeline.service');
  const { ensureCategories, indexDocument } = await import('../src/modules/knowledge-base/knowledge.service');
  const { DEFAULT_AGENTS, DEFAULT_PLAYBOOKS } = await import('../src/modules/ai/agents');
  const { computeScore, DEFAULT_SCORING } = await import('../src/modules/lead-scoring/scoring-engine');
  const { syncCampaignMetrics } = await import('../src/modules/campaigns/campaign.service');
  const { DEFAULT_SETTINGS } = await import('../src/modules/organizations/settings');
  const C = await import('./seed/content');
  const { runScenarios } = await import('./seed/scenarios');

  faker.seed(2026);
  const rnd = () => faker.number.float({ min: 0, max: 1 });
  const pickW = <T,>(items: [T, number][]): T => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [v, w] of items) if ((r -= w) <= 0) return v;
    return items[0][0];
  };
  const days = (n: number) => new Date(Date.now() - n * 86400_000);

  console.log('› Limpando dados…');
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

  console.log('› Organização, permissões e perfis…');
  await db.permission.createMany({ data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description, module: key.split('.')[0] })) });
  const perms = await db.permission.findMany();
  const org = await db.organization.create({
    data: { name: 'Operação Demo', slug: 'demo', settings: { appName: DEFAULT_SETTINGS.appName, demo: true, publicBrand: PUBLIC_BRAND } },
  });
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) {
    const def = SYSTEM_ROLES[key];
    const role = await db.role.create({ data: { organizationId: org.id, key, name: def.name, description: def.description } });
    await db.rolePermission.createMany({ data: def.permissions.map((p) => ({ roleId: role.id, permissionId: perms.find((x) => x.key === p)!.id })) });
    roles[key] = role.id;
  }

  console.log('› Regiões, 10 PJs e 31 consultores (30 + consultor de demonstração)…');
  const regionIds: Record<string, string> = {};
  for (const r of C.REGIONS) regionIds[r.name] = (await db.region.create({ data: { organizationId: org.id, ...r } })).id;
  const pjs: Awaited<ReturnType<typeof db.pJ.create>>[] = [];
  for (const p of C.PJS) {
    pjs.push(await db.pJ.create({ data: { organizationId: org.id, code: p.code, name: p.name, city: p.city, uf: 'SP', regionId: regionIds[p.region], citiesServed: p.cities, subdomain: p.subdomain, landingActive: true } }));
    // WhatsApp/telefone/endereço reais de cada unidade são cadastrados pela operação (Distribuição → PJs) — não inventamos números.
  }
  const specialties = [['IMOVEL', 'SERVICOS'], ['VEICULO', 'MOTO'], ['IMOVEL', 'VEICULO', 'BENS_MOVEIS']];
  const consultants: Awaited<ReturnType<typeof db.consultant.create>>[] = [];
  let n = 0;
  for (const pj of pjs) {
    for (let i = 0; i < 3; i++) {
      n++;
      const name = faker.person.fullName();
      consultants.push(
        await db.consultant.create({
          data: {
            organizationId: org.id,
            pjId: pj.id,
            name,
            email: `consultor${String(n).padStart(2, '0')}@prospect.demo`,
            phone: `55119${faker.string.numeric(8)}`,
            products: specialties[i],
            maxOpenLeads: [25, 30, 35][i],
            priority: i === 2 ? 5 : i,
            available: n % 11 !== 0,
          },
        })
      );
    }
  }
  // Consultor de demonstração com login fácil (PJ01, todos os produtos) — recebe leads como os demais.
  consultants.push(
    await db.consultant.create({
      data: {
        organizationId: org.id,
        pjId: pjs[0].id,
        name: 'Consultor Demonstração',
        email: 'consultor@prospect.demo',
        phone: `55119${faker.string.numeric(8)}`,
        products: ['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'BENS_MOVEIS'],
        maxOpenLeads: 40,
        priority: 5,
        available: true,
      },
    })
  );
  const password = process.env.SEED_PASSWORD ?? 'Prospect@2026';
  const hash = await hashPassword(password);
  const users: { email: string; name: string; role: string; pjId?: string }[] = [
    { email: 'superadmin@prospect.demo', name: 'Sofia Andrade', role: 'SUPER_ADMIN' },
    { email: 'admin@prospect.demo', name: 'Bruno Carvalho', role: 'ADMIN' },
    { email: 'gestor@prospect.demo', name: 'Helena Prado', role: 'MANAGER' },
    { email: 'marketing@prospect.demo', name: 'Lívia Moraes', role: 'MARKETING' },
    { email: 'ia@prospect.demo', name: 'Caio Teixeira', role: 'AI_ADMIN' },
    { email: 'auditor@prospect.demo', name: 'Renata Luz', role: 'AUDITOR' },
    // Um gestor por PJ: cada unidade entra na plataforma e vê só os próprios leads.
    ...PJ_MANAGERS.map((name, i) => ({ email: `pj${String(i + 1).padStart(2, '0')}@prospect.demo`, name, role: 'PJ_MANAGER', pjId: pjs[i].id })),
  ];
  for (const u of users) {
    await db.user.create({ data: { organizationId: org.id, email: u.email, name: u.name, roleId: roles[u.role], pjId: u.pjId ?? null, passwordHash: hash } });
  }
  for (const c of consultants) {
    // Conta de teste: consultor@ tem acesso total (Super Admin), mas segue vinculado ao cadastro de consultor.
    const roleId = c.email === 'consultor@prospect.demo' ? roles.SUPER_ADMIN : roles.CONSULTANT;
    await db.user.create({ data: { organizationId: org.id, email: c.email, name: c.name, roleId, pjId: c.pjId, consultantId: c.id, passwordHash: hash } });
  }

  // Chave do serviço de landing das PJs (apps/landing). O segredo vem do ambiente (.env, fora do git):
  // o mesmo valor vai em LANDING_SERVICE_API_KEY do app de landing.
  const landingKey = process.env.LANDING_SERVICE_API_KEY;
  if (landingKey?.startsWith('pk_')) {
    await db.apiKey.create({
      data: {
        organizationId: org.id,
        name: 'Serviço de landing das PJs',
        prefix: landingKey.slice(0, 10),
        keyHash: crypto.createHash('sha256').update(landingKey).digest('hex'),
        permissions: ['landing.service'],
      },
    });
  } else {
    console.log('  (LANDING_SERVICE_API_KEY não definida — crie a chave em Integrações → API com a permissão landing.service)');
  }

  console.log('› Pipeline, agentes, playbooks e Knowledge Base…');
  const pipeline = await ensureDefaultPipeline(org.id);
  const stage = (key: string) => pipeline.stages.find((s) => s.key === key)!;
  await db.aIAgent.createMany({ data: DEFAULT_AGENTS.map((a) => ({ organizationId: org.id, ...a })) });
  await db.aIPlaybook.createMany({ data: DEFAULT_PLAYBOOKS.map((p) => ({ organizationId: org.id, ...p, rules: [...p.rules] })) });
  await ensureCategories(org.id);
  const { ensureProductCatalog } = await import('../src/modules/products/product.service');
  await ensureProductCatalog(org.id);
  const cats = await db.knowledgeCategory.findMany({ where: { organizationId: org.id } });
  for (const d of C.KNOWLEDGE_DOCS) {
    const doc = await db.knowledgeDocument.create({
      data: {
        organizationId: org.id,
        categoryId: cats.find((c) => c.key === d.category)!.id,
        title: d.title,
        source: C.KB_DISCLAIMER,
        status: d.status ?? 'PUBLISHED',
        product: d.product ?? null,
        ownerName: 'Caio Teixeira',
        priority: d.priority ?? 0,
        versions: { create: { organizationId: org.id, version: 1, content: d.content, changeNote: 'Versão inicial (demo)' } },
      },
    });
    if (doc.status === 'PUBLISHED') await indexDocument(org.id, doc.id);
  }

  console.log('› WhatsApp: conta, números e templates…');
  const account = await db.whatsAppAccount.create({ data: { organizationId: org.id, name: 'Conta principal (mock)', provider: 'mock' } });
  await db.whatsAppNumber.createMany({
    data: [
      { organizationId: org.id, accountId: account.id, name: 'Prospect Bot', phone: '5511940000001', purpose: 'PROSPECT_BOT', status: 'CONNECTED', dailyLimit: 1000 },
      { organizationId: org.id, accountId: account.id, name: 'Qualification Bot', phone: '5511940000002', purpose: 'QUALIFICATION_BOT', status: 'CONNECTED', dailyLimit: 1000 },
      { organizationId: org.id, accountId: account.id, name: 'Equipe Jundiaí', phone: '5511940000003', purpose: 'TEAM', status: 'CONNECTED', dailyLimit: 250 },
      { organizationId: org.id, accountId: account.id, name: 'Equipe Campinas', phone: '5519940000004', purpose: 'TEAM', status: 'DISCONNECTED', dailyLimit: 250 },
    ],
  });
  for (const t of C.TEMPLATES) {
    await db.messageTemplate.create({ data: { organizationId: org.id, ...t, variables: ['1'] } });
  }

  console.log('› 10 simuladores e 10 landing pages…');
  const sims: Record<string, string> = {};
  for (const s of C.SIMULATORS) {
    sims[s.slug] = (
      await db.simulator.create({
        data: { organizationId: org.id, name: s.name, slug: s.slug, products: s.products, requiredFields: s.required, parametersVerified: false, disclaimer: C.SIMULATOR_DISCLAIMER },
      })
    ).id;
  }
  const landings: Record<string, string> = {};
  for (const l of C.LANDINGS) {
    const pj = pjs.find((p) => p.code === l.pj)!;
    const page = await db.landingPage.create({
      data: {
        organizationId: org.id,
        name: l.name,
        slug: l.slug,
        title: l.title,
        subtitle: l.subtitle,
        product: l.product,
        regionId: regionIds[l.region],
        pjId: pj.id,
        simulatorId: sims[l.simulator],
        benefits: C.BENEFITS,
        faq: C.FAQ,
        status: l.status,
        views: l.status === 'PUBLISHED' ? faker.number.int({ min: 800, max: 6000 }) : 0,
        seo: { title: l.title.slice(0, 60), description: l.subtitle },
        form: {
          create: {
            organizationId: org.id,
            fields: ['name', 'whatsapp', 'email', 'city'],
            requiredFields: ['name', 'whatsapp'],
            consentText: 'Autorizo o contato sobre esta simulação por WhatsApp e e-mail, conforme a Política de Privacidade. Posso cancelar a qualquer momento.',
          },
        },
      },
    });
    landings[l.slug] = page.id;
  }

  console.log('› +5 simuladores, +10 landings e +10 campanhas (V2: 15 / 20 / 30)…');
  const { extendAcquisition, seedV2 } = await import('./seed/v2');
  const extraCampaignIds = await extendAcquisition(db, { orgId: org.id, regionIds, pjs }, sims, landings, C.SIMULATOR_DISCLAIMER);

  console.log('› 30 campanhas + métricas (mock)…');
  const campaigns: Awaited<ReturnType<typeof db.campaign.create>>[] = [];
  for (const c of C.CAMPAIGNS) {
    const startAt = days(c.daysAgoStart);
    const camp = await db.campaign.create({
      data: {
        organizationId: org.id,
        name: c.name,
        source: c.source,
        product: c.product,
        regionId: c.region ? regionIds[c.region] : null,
        landingPageId: c.landing ? landings[c.landing] : null,
        status: c.status as never,
        budget: c.budget,
        startAt,
        endAt: new Date(startAt.getTime() + c.days * 86400_000),
        utmCampaign: c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60),
      },
    });
    campaigns.push(camp);
    if (['ACTIVE', 'PAUSED', 'COMPLETED'].includes(c.status)) await syncCampaignMetrics(org.id, camp.id, 90);
    await db.campaignEvent.create({ data: { organizationId: org.id, campaignId: camp.id, type: 'CREATED', payload: { seed: true } } });
  }
  for (const id of extraCampaignIds) {
    const camp = await db.campaign.findUniqueOrThrow({ where: { id } });
    campaigns.push(camp);
    if (['ACTIVE', 'PAUSED', 'COMPLETED'].includes(camp.status)) await syncCampaignMetrics(org.id, camp.id, 90);
  }

  console.log('› Regras de distribuição e automações…');
  const pjByCode = (code: string) => pjs.find((p) => p.code === code)!.id;
  await db.routingRule.createMany({
    data: [
      { organizationId: org.id, name: 'Imóveis · Jundiaí e Região', priority: 10, conditions: { products: ['IMOVEL'], regionIds: [regionIds['Jundiaí e Região']] }, pjIds: [pjByCode('PJ01'), pjByCode('PJ02')], method: 'EQUAL_SPLIT', capacity: 25 },
      { organizationId: org.id, name: 'Veículos · Campinas (menor carga)', priority: 20, conditions: { products: ['VEICULO', 'MOTO'], regionIds: [regionIds['Campinas e Região']] }, pjIds: [pjByCode('PJ03'), pjByCode('PJ04')], method: 'LEAST_LOAD', capacity: 30 },
      { organizationId: org.id, name: 'Capital · Leads quentes (prioridade)', priority: 5, conditions: { regionIds: [regionIds['São Paulo Capital']], minScore: 71 }, pjIds: [pjByCode('PJ05'), pjByCode('PJ06')], method: 'PRIORITY' },
      { organizationId: org.id, name: 'Motos · Grande SP Oeste', priority: 30, conditions: { products: ['MOTO'], regionIds: [regionIds['Grande SP Oeste']] }, pjIds: [pjByCode('PJ07')], method: 'EQUAL_SPLIT' },
    ],
  });
  await db.automationRule.createMany({
    data: [
      { organizationId: org.id, name: 'Lead quente → avisar consultor e criar tarefa', trigger: 'lead.scored', conditions: [{ field: 'event.score', op: 'gte', value: 71 }], actions: [{ type: 'notify_consultant', params: { title: 'Lead quente: {lead}' } }, { type: 'create_task', params: { taskType: 'CONTACT', title: 'Contatar lead quente: {lead}', dueInHours: 2, priority: 'URGENT' } }] },
      { organizationId: org.id, name: 'Lead sem atendimento → avisar gestores', trigger: 'lead.unattended', conditions: [], actions: [{ type: 'notify_role', params: { roles: ['MANAGER'], title: 'Lead sem atendimento: {lead}' } }] },
      { organizationId: org.id, name: 'Handoff da IA → tarefa de contato', trigger: 'conversation.handoff', conditions: [], actions: [{ type: 'create_task', params: { taskType: 'CONTACT', title: 'Assumir conversa: {lead}', dueInHours: 1, priority: 'HIGH' } }] },
    ],
  });

  // ─────────────────────────────── 1000 leads ───────────────────────────────
  const LEAD_COUNT = Number(process.env.SEED_LEADS ?? 1000);
  console.log(`› ${LEAD_COUNT} leads, identidades, scores e atividades…`);
  const SOURCES: [string, number][] = [['GOOGLE_ADS', 28], ['META', 18], ['INSTAGRAM', 12], ['WHATSAPP', 10], ['LANDING', 16], ['SIMULATOR', 6], ['IMPORT', 6], ['MAPS', 4]];
  const PRODUCTS: [string, number][] = [['IMOVEL', 45], ['VEICULO', 30], ['MOTO', 10], ['SERVICOS', 8], ['BENS_MOVEIS', 7]];
  const STATUS: [string, number][] = [['NEW', 24], ['QUALIFIED', 5], ['ASSIGNED', 19], ['IN_CONVERSATION', 12], ['OPPORTUNITY', 22], ['CONVERTED', 7], ['LOST', 9], ['BLOCKED', 2]];
  const VALUE: Record<string, [number, number]> = { IMOVEL: [120, 900], VEICULO: [40, 220], MOTO: [12, 60], SERVICOS: [15, 50], BENS_MOVEIS: [40, 400] };
  const OBJ: Record<string, string[]> = {
    IMOVEL: ['Aquisição de imóvel', 'Construção ou reforma', 'Investimento / patrimônio'],
    VEICULO: ['Aquisição de veículo', 'Troca de veículo'],
    MOTO: ['Aquisição de moto'],
    SERVICOS: ['Serviços (educação, saúde, eventos)'],
    BENS_MOVEIS: ['Equipamentos para empresa'],
  };
  const TERMS = ['Imediato (até 30 dias)', 'Até 3 meses', 'Até 6 meses', 'Até 12 meses', 'Mais de 12 meses'];
  const cities = C.REGIONS.flatMap((r) => r.cities.map((city) => ({ city, region: r.name })));
  const campaignsBySource = (s: string) => campaigns.filter((c) => c.source === s && c.status !== 'DRAFT' && c.status !== 'SCHEDULED');

  type SeedLead = Record<string, unknown> & { id: string; city: string | null; status: string; product: string; createdAt: Date; consultantId: string | null; pjId: string | null; desiredValue: number; phone: string; email: string | null; campaignId: string | null; source: string; score: number; temperature: string; name: string };
  const leads: SeedLead[] = [];
  const rrPointer: Record<string, number> = {};
  const usedPhones = new Set<string>();

  for (let i = 0; i < LEAD_COUNT; i++) {
    const status = pickW(STATUS);
    const product = pickW(PRODUCTS);
    const source = pickW(SOURCES);
    const loc = faker.helpers.arrayElement(cities);
    const ageDays = Math.floor(Math.pow(rnd(), 1.6) * 90); // mais leads recentes
    const createdAt = new Date(days(ageDays).getTime() - faker.number.int({ min: 0, max: 20 * 3600_000 }));
    const [vmin, vmax] = VALUE[product];
    const desiredValue = faker.number.int({ min: vmin, max: vmax }) * 1000;
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    let phone = '';
    do phone = `55${faker.helpers.arrayElement(['11', '11', '19', '15'])}9${faker.string.numeric(8)}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    const email = rnd() < 0.8 ? `${first}.${last}${i}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9.]/g, '') + '@email.demo' : null;
    const advanced = !['NEW', 'BLOCKED'].includes(status);
    const signals = {
      simulationStarted: ['LANDING', 'SIMULATOR', 'GOOGLE_ADS'].includes(source) ? rnd() < 0.8 : rnd() < 0.3,
      requestedContact: advanced ? rnd() < 0.75 : rnd() < 0.1,
      repliedBot: ['IN_CONVERSATION', 'OPPORTUNITY', 'CONVERTED'].includes(status) ? true : rnd() < 0.2,
    };
    const intent = signals.requestedContact && signals.repliedBot && rnd() < 0.6 ? 'HIGH' : signals.requestedContact ? 'MEDIUM' : 'LOW';
    const data = {
      product: advanced || rnd() < 0.6 ? product : null,
      desiredValue: advanced || rnd() < 0.5 ? desiredValue : null,
      city: rnd() < 0.9 ? loc.city : null,
      email,
      objective: advanced && rnd() < 0.7 ? faker.helpers.arrayElement(OBJ[product]) : null,
      term: advanced && rnd() < 0.6 ? faker.helpers.arrayElement(TERMS) : null,
      intent,
      signals,
    };
    const scored = computeScore(data, DEFAULT_SCORING);

    let consultantId: string | null = null;
    let pjId: string | null = null;
    if (['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY', 'CONVERTED', 'LOST'].includes(status)) {
      const regionPjs = pjs.filter((p) => p.regionId === regionIds[loc.region]);
      const pool = consultants.filter((c) => regionPjs.some((p) => p.id === c.pjId) && (c.products.includes(product) || !c.products.length));
      const list = pool.length ? pool : consultants.filter((c) => regionPjs.some((p) => p.id === c.pjId));
      const key = loc.region;
      rrPointer[key] = (rrPointer[key] ?? 0) + 1;
      const chosen = list[rrPointer[key] % list.length];
      consultantId = chosen.id;
      pjId = chosen.pjId;
    }
    const camps = campaignsBySource(source);
    const camp = camps.length && rnd() < 0.9 ? faker.helpers.arrayElement(camps) : null;
    const landing = camp?.landingPageId ?? (source === 'LANDING' ? faker.helpers.arrayElement(Object.values(landings)) : null);

    leads.push({
      id: crypto.randomUUID(),
      organizationId: org.id,
      name: `${first} ${last}`,
      phone,
      email: data.email,
      city: data.city,
      uf: data.city ? 'SP' : null,
      region: data.city ? loc.region : null,
      product: data.product as string,
      objective: data.objective,
      desiredValue: data.desiredValue as number,
      term: data.term,
      source,
      medium: ['GOOGLE_ADS', 'META', 'INSTAGRAM'].includes(source) ? 'cpc' : source.toLowerCase(),
      campaignId: camp?.id ?? null,
      utmCampaign: camp?.utmCampaign ?? null,
      landingPageId: landing,
      score: scored.score,
      temperature: scored.temperature,
      intent,
      signals,
      status,
      lostReason: status === 'LOST' ? faker.helpers.arrayElement(['Sem orçamento no momento', 'Optou por financiamento', 'Não respondeu após 3 tentativas', 'Comprou com concorrente']) : null,
      consultantId,
      pjId,
      assignedAt: consultantId ? new Date(createdAt.getTime() + faker.number.int({ min: 2, max: 90 }) * 60_000) : null,
      consentStatus: rnd() < 0.62 ? 'GRANTED' : 'UNKNOWN',
      optOut: status === 'BLOCKED',
      dataOrigin: source === 'IMPORT' ? 'Importação de base própria' : source === 'MAPS' ? 'Dado público empresarial (API autorizada)' : 'Fornecido pelo titular (formulário/conversa)',
      lastInteractionAt: signals.repliedBot ? new Date(createdAt.getTime() + faker.number.int({ min: 1, max: 72 }) * 3600_000) : null,
      capturedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      _breakdown: scored.breakdown,
    } as unknown as SeedLead);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const leadRows = leads.map(({ _breakdown, ...l }) => l);
  await db.lead.createMany({ data: leadRows as never[] });
  await db.leadIdentity.createMany({
    data: leads.flatMap((l) => [
      { organizationId: org.id, leadId: l.id, type: 'PHONE', value: l.phone },
      ...(l.email ? [{ organizationId: org.id, leadId: l.id, type: 'EMAIL', value: l.email }] : []),
    ]),
    skipDuplicates: true,
  });
  await db.leadSource.createMany({ data: leads.map((l) => ({ organizationId: org.id, leadId: l.id, source: l.source, campaignId: l.campaignId, landingPageId: l.landingPageId as string | null, receivedAt: l.createdAt })) });
  await db.leadScore.createMany({ data: leads.map((l) => ({ organizationId: org.id, leadId: l.id, score: l.score, temperature: l.temperature, breakdown: l._breakdown as object, computedAt: l.createdAt })) });
  await db.leadScoreEvent.createMany({
    data: leads.flatMap((l) => (l._breakdown as { key: string; label: string; points: number; hit: boolean }[]).filter((b) => b.hit).map((b) => ({ organizationId: org.id, leadId: l.id, ruleKey: b.key, points: b.points, reason: b.label, createdAt: l.createdAt }))),
  });
  const consultantName = (id: string | null) => consultants.find((c) => c.id === id)?.name ?? '';
  const pjCode = (id: string | null) => pjs.find((p) => p.id === id)?.code ?? '';
  await db.leadActivity.createMany({
    data: leads.flatMap((l) => [
      { organizationId: org.id, leadId: l.id, type: 'CREATED', description: `Lead capturado via ${l.source}`, actorType: 'SYSTEM', createdAt: l.createdAt },
      { organizationId: org.id, leadId: l.id, type: 'SCORED', description: `Score 0 → ${l.score} (${l.temperature})`, actorType: 'SYSTEM', createdAt: new Date(l.createdAt.getTime() + 1000) },
      ...(l.consultantId ? [{ organizationId: org.id, leadId: l.id, type: 'ASSIGNED', description: `Distribuído para ${consultantName(l.consultantId)} (${pjCode(l.pjId)}) · regra regional`, actorType: 'SYSTEM', createdAt: l.assignedAt as Date }] : []),
    ]),
  });
  await db.routingDecision.createMany({
    data: leads
      .filter((l) => l.consultantId)
      .map((l) => ({
        organizationId: org.id,
        leadId: l.id,
        pjId: l.pjId,
        consultantId: l.consultantId,
        method: 'EQUAL_SPLIT',
        ruleName: 'Histórico (seed)',
        outcome: 'ASSIGNED',
        steps: [{ step: 'Seed', detail: `Distribuição histórica para ${consultantName(l.consultantId)}`, ok: true }],
        createdAt: l.assignedAt as Date,
      })),
  });
  const consentLeads = leads.filter((l) => l.consentStatus === 'GRANTED');
  await db.consent.createMany({
    data: consentLeads.flatMap((l) => [
      { organizationId: org.id, leadId: l.id, channel: 'WHATSAPP', purpose: 'SERVICE', status: 'GRANTED', source: l.source, policyVersion: '2026-09', createdAt: l.createdAt },
      ...(rnd() < 0.45 ? [{ organizationId: org.id, leadId: l.id, channel: 'WHATSAPP', purpose: 'MARKETING', status: 'GRANTED', source: l.source, policyVersion: '2026-09', createdAt: l.createdAt }] : []),
    ]),
  });
  await db.privacyEvent.createMany({ data: consentLeads.map((l) => ({ organizationId: org.id, leadId: l.id, type: 'CONSENT_GRANTED', source: l.source, purpose: 'SERVICE', policyVersion: '2026-09', createdAt: l.createdAt })) });
  const blocked = leads.filter((l) => l.status === 'BLOCKED');
  await db.privacyEvent.createMany({ data: blocked.map((l) => ({ organizationId: org.id, leadId: l.id, type: 'OPT_OUT', source: 'WHATSAPP', policyVersion: '2026-09', createdAt: l.createdAt })) });

  // Attribution: sessões para leads com landing
  const attrLeads = leads.filter((l) => l.landingPageId);
  for (const l of attrLeads) {
    const camp = campaigns.find((c) => c.id === l.campaignId);
    const utmSource = { GOOGLE_ADS: 'google', META: 'facebook', INSTAGRAM: 'instagram' }[l.source] ?? 'direct';
    const s = await db.attributionSession.create({
      data: {
        organizationId: org.id,
        sessionKey: crypto.randomUUID(),
        landingPageId: l.landingPageId as string,
        source: utmSource,
        medium: utmSource === 'direct' ? null : 'cpc',
        campaign: camp?.utmCampaign,
        leadId: l.id,
        firstSeenAt: new Date(l.createdAt.getTime() - 5 * 60_000),
        lastSeenAt: l.createdAt,
      },
    });
    await db.attributionEvent.createMany({
      data: [
        { organizationId: org.id, sessionId: s.id, type: 'PAGE_VIEW', campaignId: l.campaignId, createdAt: new Date(l.createdAt.getTime() - 5 * 60_000) },
        { organizationId: org.id, sessionId: s.id, type: 'SIMULATION_COMPLETED', leadId: l.id, campaignId: l.campaignId, createdAt: l.createdAt },
        { organizationId: org.id, sessionId: s.id, type: 'LEAD_CREATED', leadId: l.id, campaignId: l.campaignId, createdAt: l.createdAt },
      ],
    });
  }
  await db.attributionEvent.createMany({
    data: leads
      .filter((l) => l.consultantId)
      .map((l) => ({ organizationId: org.id, type: 'ASSIGNED', leadId: l.id, consultantId: l.consultantId, campaignId: l.campaignId, createdAt: l.assignedAt as Date })),
  });

  // ─────────────────────────────── 300 oportunidades ───────────────────────────────
  console.log('› 300 oportunidades com histórico…');
  const oppCandidates = leads.filter((l) => ['OPPORTUNITY', 'CONVERTED', 'LOST'].includes(l.status) && l.consultantId);
  const extra = leads.filter((l) => ['ASSIGNED', 'IN_CONVERSATION'].includes(l.status) && l.consultantId);
  const oppLeads = [...oppCandidates, ...extra].slice(0, 300);
  const OPEN_STAGES: [string, number][] = [['OPORTUNIDADE', 20], ['CONTATO', 18], ['NECESSIDADE', 15], ['SIMULACAO', 15], ['PROPOSTA', 17], ['NEGOCIACAO', 15]];
  const stageOrder = pipeline.stages.map((s) => s.key);
  for (const l of oppLeads) {
    const stageKey = l.status === 'CONVERTED' ? 'FECHADO' : l.status === 'LOST' ? 'PERDIDO' : pickW(OPEN_STAGES);
    const st = stage(stageKey);
    const createdAt = new Date((l.assignedAt as Date).getTime() + faker.number.int({ min: 1, max: 72 }) * 3600_000);
    const closedAt = st.isWon || st.isLost ? new Date(createdAt.getTime() + faker.number.int({ min: 2, max: 25 }) * 86400_000) : null;
    const value = l.desiredValue || faker.number.int({ min: 50, max: 400 }) * 1000;
    const opp = await db.opportunity.create({
      data: {
        organizationId: org.id,
        leadId: l.id,
        pipelineId: pipeline.id,
        stageId: st.id,
        pjId: l.pjId,
        consultantId: l.consultantId,
        product: l.product ?? 'IMOVEL',
        value,
        source: l.source,
        campaignId: l.campaignId,
        status: st.isWon ? 'WON' : st.isLost ? 'LOST' : 'OPEN',
        lostReason: st.isLost ? (l.lostReason as string) : null,
        createdAt,
        updatedAt: closedAt ?? createdAt,
        closedAt: closedAt && closedAt < new Date() ? closedAt : closedAt ? new Date() : null,
      },
    });
    if (!['OPPORTUNITY', 'CONVERTED', 'LOST'].includes(l.status)) await db.lead.update({ where: { id: l.id }, data: { status: 'OPPORTUNITY' } });
    const path = stageOrder.slice(stageOrder.indexOf('OPORTUNIDADE'), st.isLost ? stageOrder.indexOf('NECESSIDADE') + 1 : stageOrder.indexOf(stageKey) + 1).filter((k) => k !== 'PERDIDO' || st.isLost);
    if (st.isLost) path.push('PERDIDO');
    await db.opportunityActivity.createMany({
      data: path.map((k, idx) => ({
        organizationId: org.id,
        opportunityId: opp.id,
        type: idx === 0 ? 'CREATED' : k === 'FECHADO' ? 'CLOSED_WON' : k === 'PERDIDO' ? 'CLOSED_LOST' : 'STAGE_CHANGED',
        fromStage: idx === 0 ? null : path[idx - 1],
        toStage: k,
        description: idx === 0 ? 'Oportunidade criada' : `${stage(path[idx - 1]).name} → ${stage(k).name}`,
        createdAt: new Date(createdAt.getTime() + idx * 36 * 3600_000),
      })),
    });
    await db.attributionEvent.create({ data: { organizationId: org.id, type: 'OPPORTUNITY_CREATED', leadId: l.id, opportunityId: opp.id, consultantId: l.consultantId, campaignId: l.campaignId, value, createdAt } });
    if (st.isWon) await db.attributionEvent.create({ data: { organizationId: org.id, type: 'CONVERSION', leadId: l.id, opportunityId: opp.id, consultantId: l.consultantId, campaignId: l.campaignId, value, createdAt: opp.closedAt! } });
    await db.leadActivity.create({ data: { organizationId: org.id, leadId: l.id, type: 'OPPORTUNITY', description: `Oportunidade #${opp.code} criada`, actorType: 'USER', createdAt } });
  }

  // ─────────────────────────────── 300 conversas ───────────────────────────────
  console.log('› 300 conversas com histórico de IA…');
  const { buildConversation } = await import('./seed/conversations');
  const convLeads = leads.filter((l) => l.consentStatus === 'GRANTED' && ['IN_CONVERSATION', 'ASSIGNED', 'OPPORTUNITY', 'CONVERTED', 'QUALIFIED', 'NEW'].includes(l.status))
    .slice(0, 300);
  const numbers = await db.whatsAppNumber.findMany({ where: { organizationId: org.id } });
  for (const [idx, l] of convLeads.entries()) {
    await buildConversation(db, { orgId: org.id, lead: l, consultantName: consultantName(l.consultantId), numbers, idx, faker });
  }

  console.log('› Tarefas, prospecção empresarial…');
  const taskLeads = leads.filter((l) => l.consultantId && ['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY'].includes(l.status)).slice(0, 60);
  await db.task.createMany({
    data: taskLeads.map((l, i) => ({
      organizationId: org.id,
      type: faker.helpers.arrayElement(['CONTACT', 'FOLLOW_UP', 'CALLBACK', 'PROPOSAL', 'MEETING']),
      title: faker.helpers.arrayElement(['Retornar ligação', 'Enviar simulação oficial', 'Follow-up da proposta', 'Confirmar documentos', 'Agendar reunião']) + ` · ${l.name.split(' ')[0]}`,
      leadId: l.id,
      consultantId: l.consultantId,
      dueAt: new Date(Date.now() + (i % 4 === 0 ? -1 : 1) * faker.number.int({ min: 2, max: 72 }) * 3600_000),
      priority: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']),
      origin: i % 5 === 0 ? 'AUTOMATION' : 'MANUAL',
    })),
  });
  const { MockMapsProvider } = await import('../src/modules/integrations/maps/maps.provider');
  const maps = new MockMapsProvider('google_maps', 'Google Maps (mock)');
  for (const [category, city] of [['Construtoras', 'Jundiaí'], ['Concessionárias', 'Campinas'], ['Clínicas', 'Sorocaba']]) {
    const results = await maps.searchBusinesses({ category, city, uf: 'SP', limit: 12 });
    const search = await db.prospectSearch.create({ data: { organizationId: org.id, provider: 'google_maps:mock', filters: { category, city, uf: 'SP' }, resultCount: results.length } });
    await db.businessProspect.createMany({ data: results.map((r) => ({ organizationId: org.id, searchId: search.id, ...r, source: 'Google Maps (mock)', phone: r.phone ? `55${r.phone.replace(/\D/g, '')}` : null })) });
  }

  console.log('› Cenários de demonstração (fluxo real: engine + Maestro)…');
  const scenarios = await runScenarios(org.id);
  await db.organization.update({ where: { id: org.id }, data: { settings: { appName: DEFAULT_SETTINGS.appName, demo: true, publicBrand: PUBLIC_BRAND, demoScenarios: scenarios as unknown as object[] } } });

  console.log('› LGPD: solicitações de titulares…');
  await db.dataRequest.createMany({
    data: [
      { organizationId: org.id, requesterName: 'Titular Exemplo Um', requesterEmail: 'titular1@email.demo', type: 'ACCESS', status: 'OPEN', dueAt: new Date(Date.now() + 10 * 86400_000) },
      { organizationId: org.id, requesterName: 'Titular Exemplo Dois', requesterEmail: 'titular2@email.demo', type: 'DELETION', status: 'IN_PROGRESS', dueAt: new Date(Date.now() + 4 * 86400_000) },
    ],
  });

  console.log('› V2: Knowledge Base, lacunas, automações, sinais, intenções, perdas, saúde, duplicidades, playbooks, AI Lab, experimentos, NBA e insights…');
  await seedV2(db, org.id, faker);

  // Kit de divulgação: modelos de exemplo, NÃO aprovados (a gestão revisa antes de liberar).
  const { ensureExampleTemplates } = await import('../src/modules/outreach/outreach.service');
  await ensureExampleTemplates(org.id);

  // Link próprio (bio) de cada consultor: <nome>.<domínio> — página igual à mestre, lead vai para ele.
  const { ensureLandingSlug } = await import('../src/modules/consultants/landing-link');
  for (const c of await db.consultant.findMany({ where: { landingSlug: null }, select: { id: true }, orderBy: { createdAt: 'asc' } })) await ensureLandingSlug(c.id);

  const counts = {
    leads: await db.lead.count(),
    oportunidades: await db.opportunity.count(),
    conversas: await db.conversation.count(),
    campanhas: await db.campaign.count(),
    landings: await db.landingPage.count(),
    simuladores: await db.simulator.count(),
    pjs: await db.pJ.count(),
    consultores: await db.consultant.count(),
    mensagens: await db.message.count(),
    documentosKB: await db.knowledgeDocument.count(),
    lacunas: await db.knowledgeGap.count(),
    automacoes: await db.automationRule.count(),
    insights: await db.aIInsight.count(),
    proximasAcoes: await db.nextBestAction.count({ where: { status: 'OPEN' } }),
  };
  console.log('\n✔ Seed concluído:', counts);
  console.log(`\nLogin: gestor@prospect.demo · senha: ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : password}`);
  await db.$disconnect();
  // Os engines publicam eventos de tempo real via Redis; as conexões abertas impediriam o processo de encerrar.
  const { closeRealtime } = await import('../src/lib/realtime');
  const { closeRedis } = await import('../src/lib/redis');
  await closeRealtime();
  await closeRedis();
}

main()
  // Encerra explicitamente: conexões abertas pelos serviços (ex.: Redis das filas/rate limit)
  // manteriam o processo vivo depois do seed concluído.
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
