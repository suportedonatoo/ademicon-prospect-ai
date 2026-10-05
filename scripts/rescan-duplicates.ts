// Refaz a varredura de duplicidades da organização demo (útil após mudar o motor de comparação).
// Uso: npx tsx --env-file=.env scripts/rescan-duplicates.ts
async function main() {
  const { db } = await import('../src/lib/db');
  const { scanDuplicates } = await import('../src/modules/leads/duplicates.service');
  const org = await db.organization.findFirstOrThrow({ where: { slug: 'demo' } });
  const t = Date.now();
  await db.duplicateCandidate.deleteMany({ where: { organizationId: org.id, status: 'OPEN' } });
  console.log(await scanDuplicates(org.id, { days: 400, limit: 2000 }), `${Date.now() - t}ms`);
  console.log(await db.duplicateCandidate.groupBy({ by: ['level'], where: { organizationId: org.id, status: 'OPEN' }, _count: { _all: true } }));
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
