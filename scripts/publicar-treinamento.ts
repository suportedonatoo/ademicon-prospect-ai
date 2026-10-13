// Cadastra as aulas de src/modules/training/lessons.json na área de Treinamento (uma vez por organização; pode rodar de novo).
// Itens já cadastrados (inclusive com o link antigo do PDF) são atualizados, sem perder o progresso de quem concluiu.
// Uso: set -a; source .env.supabase; set +a; npx tsx --env-file=.env scripts/publicar-treinamento.ts
// Outro endereço (teste local): TREINAMENTO_BASE_URL=http://localhost:3500 antes do comando.
import lessons from '../src/modules/training/lessons.json';

const base = (process.env.TREINAMENTO_BASE_URL || 'https://stacksolution.com.br').replace(/\/$/, '');

async function main() {
  const { db } = await import('../src/lib/db');
  const { lessonSlug } = await import('../src/modules/training/training.service');
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const existing = await db.trainingItem.findMany({ where: { organizationId: org.id }, select: { id: true, url: true } });
    let criados = 0;
    for (const l of lessons) {
      const data = {
        title: l.code ? `${l.code} · ${l.title}` : 'Comece aqui',
        description: l.subtitle + (l.minutes ? ` · ${l.minutes} min` : ''),
        url: `${base}/treinamento/aula/${l.slug}`,
        category: l.trail,
        order: Number(l.slug.replace(/\D/g, '')),
      };
      const old = existing.find((e) => lessonSlug(e.url) === l.slug);
      if (old) await db.trainingItem.update({ where: { id: old.id }, data });
      else {
        await db.trainingItem.create({ data: { organizationId: org.id, ...data } });
        criados++;
      }
    }
    console.log(`${org.name}: ${criados} aula(s) cadastrada(s), ${lessons.length - criados} atualizada(s).`);
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
