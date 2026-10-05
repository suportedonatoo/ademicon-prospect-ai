// Gera o link próprio (bio) para os consultores que ainda não têm. Não mexe em quem já tem.
// Uso: npx tsx --env-file=.env scripts/gerar-links.ts
async function main() {
  const { db } = await import('../src/lib/db');
  const { ensureLandingSlug, landingUrlFor } = await import('../src/modules/consultants/landing-link');
  const list = await db.consultant.findMany({ where: { landingSlug: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  for (const c of list) console.log(`${c.name} → ${landingUrlFor(await ensureLandingSlug(c.id))}`);
  console.log(`${list.length} link(s) gerado(s).`);
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
