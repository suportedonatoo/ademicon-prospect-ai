import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Código do servidor (sem 'use client') não pode CHAMAR função exportada de um módulo 'use client':
 * em produção a página quebra com "Application error" (aconteceu na Divulgação com referralMessage).
 * Componentes podem ser renderizados; funções utilitárias têm que ficar num módulo comum.
 */
const ROOT = path.resolve(__dirname, '../../src');
const files: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(f)) files.push(p);
  }
})(ROOT);
const USE_CLIENT = /^\s*['"]use client['"]/;
const resolve = (from: string, spec: string) => {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
};

describe('fronteira servidor × cliente', () => {
  it('nenhum arquivo do servidor chama função de um módulo "use client"', () => {
    const problems: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (USE_CLIENT.test(src)) continue;
      for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const target = resolve(f, m[2]);
        if (!target || !USE_CLIENT.test(fs.readFileSync(target, 'utf8'))) continue;
        const rest = src.replace(m[0], '');
        for (const raw of m[1].split(',')) {
          const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!;
          if (/^[a-z]/.test(name) && new RegExp(`\\b${name}\\s*\\(`).test(rest)) problems.push(`${path.relative(ROOT, f)} chama ${name}() de ${m[2]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
