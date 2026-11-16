// npm audit com lista de riscos ACEITOS (justificados). Falha em qualquer vulnerabilidade alta/crítica nova.
// Uso: node scripts/audit.mjs [pasta]
import { spawnSync } from 'node:child_process';

const ACCEPTED = {
  // Prisma CLI (migrations) → @prisma/config → deepmerge-ts: DoS ao mesclar objetos recursivos da CONFIG do
  // próprio projeto. Só roda no build/deploy, sem entrada de usuário. Corrigir exige rebaixar o Prisma
  // (quebra). Reavaliar a cada atualização do Prisma.
  'GHSA-ggr8-5vv4-36mx': 'deepmerge-ts via Prisma CLI — só build/deploy, sem entrada de usuário',
  // Zod 3: correção só no Zod 4 (major, reescreve todos os schemas). Mitigado: body() em src/lib/api.ts
  // recusa JSON acima de 1 MB antes de validar. Reavaliar ao migrar para o Zod 4.
  'GHSA-mrhx-c7xc-m3w5': 'zod 3 — corpo JSON limitado a 1 MB em body() (src/lib/api.ts)',
};

const cwd = process.argv[2] ?? '.';
const r = spawnSync('npm audit --omit=dev --json', { shell: true, cwd, encoding: 'utf8' });
const report = JSON.parse(r.stdout || '{}');
const blocking = [];
const accepted = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (!['high', 'critical'].includes(v.severity)) continue;
  const advisories = v.via.filter((x) => typeof x === 'object');
  // Pacote que só é vulnerável por depender de outro: herda o status da dependência.
  if (!advisories.length) continue;
  for (const a of advisories) {
    const id = String(a.url ?? '').split('/').pop();
    (ACCEPTED[id] ? accepted : blocking).push(`${name} · ${a.severity} · ${a.title} (${id})`);
  }
}
if (accepted.length) console.log('Riscos aceitos (documentados):\n  - ' + accepted.join('\n  - '));
if (blocking.length) {
  console.log('\nVULNERABILIDADES ALTAS/CRÍTICAS NÃO TRATADAS:\n  - ' + blocking.join('\n  - '));
  process.exit(1);
}
console.log(`Nenhuma vulnerabilidade alta/crítica pendente em ${cwd}.`);
