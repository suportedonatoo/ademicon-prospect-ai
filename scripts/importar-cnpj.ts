// IMPORTA A BASE CNPJ DA RECEITA (Dados Abertos) — rodar no servidor, uma vez por mês.
//
// Uso:
//   npx tsx --env-file=.env scripts/importar-cnpj.ts --mes 2026-10 --ufs SP --dir /dados/cnpj/2026-10 [--baixar]
//
//   --mes    AAAA-MM do arquivo publicado pela Receita
//   --ufs    UFs a manter, separadas por vírgula (ex.: SP,MG). Sem --ufs = Brasil inteiro (dezenas de GB no banco).
//   --dir    pasta com os ZIPs (Empresas0..9, Estabelecimentos0..9, Socios0..9, Simples, Cnaes, Municipios, Naturezas, Qualificacoes)
//   --baixar baixa os ZIPs do mês para --dir antes de importar (CNPJ_DATA_URL muda o endereço base)
//
// Precisa do comando `unzip` e de uma conexão DIRETA ao Postgres (COPY não passa pelo pooler em modo transação).
// O mês anterior fica no schema "cnpj_anterior" (usado pelos gatilhos da Fase 4).
// Cron sugerido (dia 20 de cada mês, 3h): 0 3 20 * * cd /app && npx tsx --env-file=.env scripts/importar-cnpj.ts --mes $(date +\%Y-\%m) --ufs SP --dir /dados/cnpj/$(date +\%Y-\%m) --baixar
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { importCnpj, MONTH_FILES } from '../src/modules/cnpj/importer';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function download(month: string, dir: string) {
  const base = (process.env.CNPJ_DATA_URL ?? 'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj').replace(/\/$/, '');
  mkdirSync(dir, { recursive: true });
  for (const name of MONTH_FILES) {
    const dest = path.join(dir, name);
    if (existsSync(dest) && statSync(dest).size > 0) continue; // retomada: não baixa de novo
    const url = `${base}/${month}/${name}`;
    console.log(`baixando ${url}`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download falhou (${res.status}): ${url}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(`${dest}.part`));
    (await import('node:fs')).renameSync(`${dest}.part`, dest);
  }
}

async function main() {
  const month = arg('mes');
  const dir = arg('dir');
  if (!month || !/^\d{4}-\d{2}$/.test(month) || !dir) throw new Error('Use: --mes AAAA-MM --dir <pasta> [--ufs SP,MG] [--baixar]');
  if (process.argv.includes('--baixar')) await download(month, dir);
  const t = Date.now();
  const r = await importCnpj({ dir, month, ufs: (arg('ufs') ?? '').split(',').filter(Boolean) });
  console.log(`Importação ${r.month} (${r.ufs.join(',') || 'Brasil'}) concluída em ${Math.round((Date.now() - t) / 1000)} s:`, r.counts);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
