// Lista as contas do sistema (sem senhas — elas ficam só como hash no banco).
// Uso: set -a; source .env.supabase; set +a; npx tsx --env-file=.env scripts/listar-acessos.ts
async function main() {
  const { db } = await import('../src/lib/db');
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { name: true, email: true, status: true, createdAt: true, lastLoginAt: true, role: { select: { name: true } }, consultant: { select: { instagramUsername: true, _count: { select: { whatsappNumbers: true } } } } },
  });
  const d = (x: Date | null) => (x ? x.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
  console.log('| # | Nome | Login | Perfil | Criado em | Último acesso | WhatsApp | Instagram |');
  console.log('|---|---|---|---|---|---|---|---|');
  users.forEach((u, i) =>
    console.log(`| ${i + 1} | ${u.name} | ${u.email} | ${u.role.name} | ${d(u.createdAt)} | ${d(u.lastLoginAt)} | ${u.consultant ? u.consultant._count.whatsappNumbers : '—'} | ${u.consultant?.instagramUsername ? '@' + u.consultant.instagramUsername : '—'} |`)
  );
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
