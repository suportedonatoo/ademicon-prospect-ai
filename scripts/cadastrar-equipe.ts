// Cadastra no banco os consultores de equipe-consultores.csv que já têm WhatsApp preenchido,
// pela mesma rotina do "Subir planilha". Quem já existe ou está sem número é pulado.
// As senhas provisórias vão para acessos-consultores.txt (não aparecem no terminal).
// Uso: set -a; source .env.supabase; set +a; npx tsx --env-file=.env scripts/cadastrar-equipe.ts
import fs from 'node:fs';

async function main() {
  if (!process.env.DATABASE_URL?.includes('supabase.com')) throw new Error('DATABASE_URL não aponta para o Supabase; nada foi feito.');
  const { db } = await import('../src/lib/db');
  const { importTeam, parseTeamCsv } = await import('../src/modules/team/team.service');

  const lines = fs.readFileSync('equipe-consultores.csv', 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const rows = parseTeamCsv(lines.join('\n'));
  const existing = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));
  const ready = rows.filter((r) => r.numbers.length && !existing.has(r.email.toLowerCase()));
  for (const r of rows) if (!ready.includes(r)) console.log(`– pulado: ${r.name} (${r.numbers.length ? 'já cadastrado' : 'sem WhatsApp'})`);
  if (!ready.length) return console.log('Ninguém para cadastrar.');

  const admin = await db.user.findFirst({ where: { role: { key: 'SUPER_ADMIN' } } });
  if (!admin) throw new Error('Super Admin não encontrado.');
  const ctx = { orgId: admin.organizationId, userId: admin.id, userName: admin.name, roleKey: 'SUPER_ADMIN', scope: 'ORG' as const, permissions: new Set(['*']), pjId: null, consultantId: null, via: 'system' as const };
  const csv = [lines[0], ...ready.map((r) => lines[r.line - 1])].join('\n');
  const res = await importTeam(ctx, csv);

  const out = res.results.filter((r) => r.ok).map((r) => `${r.name}\n  login: ${r.email}\n  senha provisória: ${'tempPassword' in r ? r.tempPassword : ''}\n`);
  if (out.length) {
    fs.appendFileSync('acessos-consultores.txt', out.join('\n') + '\n', { mode: 0o600 });
    fs.chmodSync('acessos-consultores.txt', 0o600);
  }
  for (const r of res.results) console.log(r.ok ? `✔ cadastrado: ${r.name} (${r.email})` : `✖ ${r.name}: ${'error' in r ? r.error : ''}`);
  console.log(`\n${res.created} cadastrado(s). Senhas em acessos-consultores.txt.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
