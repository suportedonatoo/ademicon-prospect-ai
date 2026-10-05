// Bateria completa antes de colocar no ar:  npm run test:completo
// Pré-requisito para as etapas E2E: gestão (3500) e landing (3600) rodando (Iniciar.bat).
import { spawnSync } from 'node:child_process';

const landing = { cwd: 'apps/landing' };
const steps = [
  ['Lint — gestão', 'npm run lint'],
  ['Tipos — gestão', 'npm run typecheck'],
  ['Lint — landing', 'npx eslint . --max-warnings=0', landing],
  ['Tipos — landing', 'npx tsc --noEmit', landing],
  ['Testes unitários + integração', 'npx vitest run'],
  ['E2E — fluxo principal', 'npx vitest run --config vitest.e2e.config.ts tests/e2e/flow.test.ts'],
  ['E2E — segurança', 'npx vitest run --config vitest.e2e.config.ts tests/e2e/security.test.ts'],
  ['E2E — tráfego pago/orgânico + 20 conversas do bot', 'npx vitest run --config vitest.e2e.config.ts tests/e2e/traffic-bot.test.ts'],
  ['E2E — golden path V2 (campanha → conversão → revenue → extensão)', 'npx vitest run --config vitest.e2e.config.ts tests/e2e/v2-golden-path.test.ts'],
  ['Extensão Chrome/Edge (build)', 'npm run extension:build'],
  ['Build — gestão', 'npm run build', { env: { NEXT_DIST_DIR: '.next-build' } }],
  ['Build — landing', 'npm run build', { ...landing, env: { NEXT_DIST_DIR: '.next-build' } }],
  ['Dependências (npm audit, alta/crítica) — gestão', 'node scripts/audit.mjs .'],
  ['Dependências (npm audit, alta/crítica) — landing', 'node scripts/audit.mjs apps/landing'],
];

const only = process.argv[2]; // filtro opcional: npm run test:completo -- E2E
const results = [];
for (const [name, cmd, opts = {}] of steps) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m  (${cmd})`);
  const t = Date.now();
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
  results.push({ etapa: name, resultado: r.status === 0 ? 'OK' : 'FALHOU', segundos: Math.round((Date.now() - t) / 1000) });
}

console.log('\n=== RESUMO DA BATERIA ===');
console.table(results);
const failed = results.filter((r) => r.resultado !== 'OK');
console.log(failed.length ? `\x1b[31m${failed.length} etapa(s) com falha.\x1b[0m` : '\x1b[32mTudo OK — pronto para rodar.\x1b[0m');
process.exit(failed.length ? 1 : 0);
