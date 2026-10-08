// Aplica as FAIXAS OFICIAIS da Ademicon (crédito e parcela por tipo) em TODOS os simuladores do banco.
// Fonte e data: src/modules/simulators/ademicon-official.ts. Prazo/taxa oficiais continuam vazios até a
// unidade enviar a tabela de planos — por isso o site mostra as faixas reais, sem tabela de parcelas estimada.
// Uso: npx tsx --env-file=.env scripts/aplicar-faixas-ademicon.ts   (ou com DATABASE_URL do banco desejado)
async function main() {
  const { db } = await import('../src/lib/db');
  const { withOfficialRanges, OFFICIAL_COLLECTED_AT } = await import('../src/modules/simulators/ademicon-official');
  type P = import('../src/modules/simulators/simulation-engine').SimulatorProductConfig;
  const sims = await db.simulator.findMany({ select: { id: true, name: true, products: true } });
  let changed = 0;
  for (const s of sims) {
    const before = s.products as unknown as P[];
    const after = withOfficialRanges(before);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    await db.simulator.update({ where: { id: s.id }, data: { products: after as object } });
    changed++;
    console.log(`  ${s.name}: ${after.map((p) => `${p.label} ${p.minValue.toLocaleString('pt-BR')}–${p.maxValue.toLocaleString('pt-BR')}`).join(' · ')}`);
  }
  console.log(`${changed} de ${sims.length} simulador(es) atualizados com as faixas oficiais de ${OFFICIAL_COLLECTED_AT}.`);
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
