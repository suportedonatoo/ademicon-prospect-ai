// PREPARA O BANCO DO PILOTO — estrutura real, SEM dados fictícios (nenhum lead, consultor ou conversa de demonstração).
// Roda UMA vez num banco novo (já migrado). Se o banco já tiver organização, não faz nada (nunca apaga dados).
//
// Uso (no servidor, depois de `npx prisma migrate deploy`):
//   PILOTO_MARCA="Ademicon" PILOTO_UNIDADE="Unidade X" PILOTO_CIDADE="Cidade" PILOTO_UF="SP" \
//   PILOTO_SUPERADMINS="voce@empresa.com,socio@empresa.com" PILOTO_ADMIN="gestor@unidade.com" PILOTO_ADMIN_NOME="Nome do Gestor" \
//   npx tsx --env-file=.env scripts/preparar-piloto.ts
//
// Imprime UMA vez as senhas provisórias e a chave do serviço de landing (guarde num cofre).
// O conteúdo da Ademicon (base de conhecimento, textos do kit) entra para REVISÃO — nada é publicado sem aprovação.
import crypto from 'node:crypto';

const need = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Defina ${k} (veja o cabeçalho do script).`);
  return v;
};

async function main() {
  const brand = need('PILOTO_MARCA');
  const unitName = need('PILOTO_UNIDADE');
  const city = need('PILOTO_CIDADE');
  const uf = need('PILOTO_UF').toUpperCase().slice(0, 2);
  const superAdmins = need('PILOTO_SUPERADMINS')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const adminEmail = need('PILOTO_ADMIN').toLowerCase();
  const adminName = process.env.PILOTO_ADMIN_NOME?.trim() || 'Gestão';

  const { db } = await import('../src/lib/db');
  if (await db.organization.count()) {
    console.log('Este banco já tem uma organização. Nada foi feito (o script nunca apaga dados).');
    await db.$disconnect();
    process.exit(0);
  }

  const { PERMISSIONS, SYSTEM_ROLES, ROLE_KEYS } = await import('../src/modules/roles/permissions');
  const { hashPassword } = await import('../src/modules/auth/auth.service');
  const { ensureDefaultPipeline } = await import('../src/modules/pipelines/pipeline.service');
  const { ensureCategories } = await import('../src/modules/knowledge-base/knowledge.service');
  const { ensureProductCatalog } = await import('../src/modules/products/product.service');
  const { DEFAULT_AGENTS, DEFAULT_PLAYBOOKS } = await import('../src/modules/ai/agents');
  const { updateOrgSettings } = await import('../src/modules/organizations/settings');
  const { ensureExampleTemplates } = await import('../src/modules/outreach/outreach.service');
  const C = await import('../prisma/seed/content');

  // Permissões e papéis
  if (!(await db.permission.count())) {
    await db.permission.createMany({ data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description, module: key.split('.')[0] })) });
  }
  const perms = await db.permission.findMany();
  const org = await db.organization.create({ data: { name: brand, slug: crypto.randomBytes(4).toString('hex') } });
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) {
    const role = await db.role.create({ data: { organizationId: org.id, key, name: SYSTEM_ROLES[key].name } });
    await db.rolePermission.createMany({ data: SYSTEM_ROLES[key].permissions.map((p) => ({ roleId: role.id, permissionId: perms.find((x) => x.key === p)!.id })) });
    roles[key] = role.id;
  }

  // Marca pública e landing central sem contato inventado
  await updateOrgSettings(org.id, {
    publicBrand: { name: brand, tagline: 'Atendimento online — no Brasil e no exterior', privacyUrl: null },
    centralLanding: { title: null, subtitle: null, whatsapp: null, phone: null },
  });

  // A unidade (todos os consultores do piloto entram nela)
  const pj = await db.pJ.create({ data: { organizationId: org.id, code: 'PJ01', name: unitName, city, uf, citiesServed: [city] } });

  // Pipeline, agentes da IA, playbooks e catálogo
  await ensureDefaultPipeline(org.id);
  await db.aIAgent.createMany({ data: DEFAULT_AGENTS.map((a) => ({ organizationId: org.id, ...a })) });
  await db.aIPlaybook.createMany({ data: DEFAULT_PLAYBOOKS.map((p) => ({ organizationId: org.id, ...p, rules: [...p.rules] })) });
  await ensureCategories(org.id);
  await ensureProductCatalog(org.id);

  // Base de conhecimento: textos genéricos para a Ademicon REVISAR (status REVIEW — a IA não usa até publicar)
  const cats = await db.knowledgeCategory.findMany({ where: { organizationId: org.id } });
  for (const d of C.KNOWLEDGE_DOCS) {
    await db.knowledgeDocument.create({
      data: {
        organizationId: org.id,
        categoryId: (cats.find((c) => c.key === d.category) ?? cats[0]).id,
        title: d.title,
        source: 'Rascunho para revisão — substituir/aprovar com material oficial da Ademicon',
        status: 'REVIEW',
        product: d.product ?? null,
        ownerName: adminName,
        priority: d.priority ?? 0,
        versions: { create: { organizationId: org.id, version: 1, content: d.content, changeNote: 'Rascunho inicial para revisão' } },
      },
    });
  }

  // Simulador: estimativa (parâmetros NÃO verificados até a Ademicon passar a tabela oficial)
  const completo = C.SIMULATORS.find((s) => s.slug === 'simulador-completo')!;
  await db.simulator.create({
    data: { organizationId: org.id, name: completo.name, slug: completo.slug, products: completo.products as object, requiredFields: completo.required, parametersVerified: false, disclaimer: C.SIMULATOR_DISCLAIMER },
  });

  // WhatsApp: conta conforme o provedor configurado (os números entram no cadastro de cada consultor)
  await db.whatsAppAccount.create({ data: { organizationId: org.id, name: 'Conta principal', provider: process.env.WHATSAPP_PROVIDER === 'cloud-api' ? 'cloud-api' : 'mock' } });

  // Kit de divulgação: modelos de exemplo NÃO aprovados
  await ensureExampleTemplates(org.id);

  // Template de abertura do WhatsApp (RASCUNHO): enviar para aprovação da Meta em WhatsApp → Templates e, aprovado,
  // marcar "Usar para iniciar conversas". Sem ele, o bot só responde quando o cliente escreve (botão da landing).
  await db.messageTemplate.create({
    data: {
      organizationId: org.id,
      name: 'retorno_simulacao',
      category: 'UTILITY',
      language: 'pt_BR',
      variables: ['nome', 'produto'],
      body: 'Olá, {{nome}}! Recebemos a sua simulação de {{produto}} no nosso site. Posso continuar o seu atendimento por aqui? Se não quiser receber mensagens, responda PARAR.',
    },
  });

  // Acessos: Super Admin (equipe da plataforma) e Admin Ademicon — senhas provisórias, exibidas uma vez
  const created: { email: string; role: string; password: string }[] = [];
  const mkUser = async (email: string, name: string, role: 'SUPER_ADMIN' | 'ADMIN') => {
    const password = crypto.randomBytes(12).toString('base64url');
    await db.user.create({ data: { organizationId: org.id, email, name, roleId: roles[role], passwordHash: await hashPassword(password) } });
    created.push({ email, role, password });
  };
  for (const e of superAdmins) await mkUser(e, e.split('@')[0], 'SUPER_ADMIN');
  await mkUser(adminEmail, adminName, 'ADMIN');

  // Chave do serviço de landing (vai em LANDING_SERVICE_API_KEY do app de landing)
  const landingKey = `pk_${crypto.randomBytes(24).toString('base64url')}`;
  await db.apiKey.create({
    data: { organizationId: org.id, name: 'Serviço de landing', prefix: landingKey.slice(0, 10), keyHash: crypto.createHash('sha256').update(landingKey).digest('hex'), permissions: ['landing.service'] },
  });

  console.log(`\n✔ Banco do piloto pronto: ${brand} · unidade ${pj.name} (${city}/${uf}). Nenhum dado fictício criado.\n`);
  console.log('ACESSOS (senhas provisórias — aparecem só agora; entregue por canal privado):');
  for (const u of created) console.log(`  ${u.role.padEnd(11)} ${u.email}  →  ${u.password}`);
  console.log(`\nLANDING_SERVICE_API_KEY=${landingKey}`);
  console.log('  (coloque esse valor no .env do servidor e reinicie o serviço de landing)\n');
  console.log('PRÓXIMOS PASSOS:');
  console.log('  1. Super Admin → Colaboradores: cadastrar os consultores (cada um ganha o link próprio).');
  console.log('  2. IA → Knowledge Base: a Ademicon revisa e PUBLICA os textos aprovados (até lá a IA não usa).');
  console.log('  3. Gestão → Divulgação: revisar e aprovar os modelos do kit.');
  console.log('  4. Configurações: link da Política de Privacidade (publicBrand.privacyUrl) e contatos da página mestre.');
  console.log('  5. Simuladores: quando houver a tabela oficial, ajustar parâmetros e marcar como verificados.');
  console.log('  6. WhatsApp: siga docs/whatsapp-meta.md (número do bot, token, webhook e template de abertura).');
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
