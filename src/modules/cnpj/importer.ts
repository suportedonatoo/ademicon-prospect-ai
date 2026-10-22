import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { FILES, type FileKind } from './layout';
import { finalDdl, indexDdl, LIVE, NEXT, PREVIOUS, stagingDdl } from './ddl';

// IMPORTAÇÃO MENSAL dos Dados Abertos CNPJ: COPY de cada arquivo numa tabela de carga, conversão para as
// tabelas finais (só as UFs escolhidas, para caber no banco), índices e troca atômica do schema.
// O mês anterior fica em "cnpj_anterior" (a Fase 4 compara os dois para gerar os gatilhos).

/** URL do Postgres para o driver pg: tira os parâmetros que só o Prisma entende. */
export function pgUrl(url = process.env.DATABASE_URL ?? '') {
  const u = new URL(url);
  for (const k of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size', 'socket_timeout']) u.searchParams.delete(k);
  return u.toString();
}

/** Arquivos de um tipo na pasta: ZIP oficial ou CSV já extraído (testes). */
export function filesFor(dir: string, kind: FileKind) {
  const prefix = FILES[kind].prefix.toLowerCase();
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().startsWith(prefix) && /\.(zip|csv)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function openFile(file: string): Readable {
  if (!/\.zip$/i.test(file)) return createReadStream(file);
  // unzip do sistema: o Node não abre ZIP nativamente e os arquivos têm GBs (streaming, sem descompactar no disco).
  const p = spawn('unzip', ['-p', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  return p.stdout;
}

const DATE = (c: string, s: string) => `${s}.to_dt(${c})`;

/** SQL que leva a tabela de carga para a final. ufs vazio = Brasil inteiro. */
function transformSql(s: string, kind: FileKind, ufs: string[]) {
  const onlyUfs = ufs.length ? `WHERE uf = ANY('{${ufs.join(',')}}')` : '';
  const ofLoaded = ufs.length ? `WHERE EXISTS (SELECT 1 FROM ${s}.estabelecimento e WHERE e.cnpj_basico = t.cnpj_basico)` : '';
  switch (kind) {
    case 'estabelecimento':
      return `INSERT INTO ${s}.estabelecimento
        SELECT cnpj_basico || cnpj_ordem || cnpj_dv, cnpj_basico, matriz_filial = '1', nullif(trim(nome_fantasia), ''), situacao, ${DATE('data_situacao', s)},
          motivo_situacao, ${DATE('data_inicio', s)}, cnae_principal, string_to_array(nullif(trim(cnaes_secundarios), ''), ','),
          nullif(trim(tipo_logradouro), ''), nullif(trim(logradouro), ''), nullif(trim(numero), ''), nullif(trim(complemento), ''), nullif(trim(bairro), ''),
          nullif(trim(cep), ''), uf, municipio, nullif(trim(coalesce(ddd1, '')) || trim(coalesce(telefone1, '')), ''),
          nullif(trim(coalesce(ddd2, '')) || trim(coalesce(telefone2, '')), ''), lower(nullif(trim(email), ''))
        FROM ${s}.stg_estabelecimento ${onlyUfs}
        ON CONFLICT (cnpj) DO NOTHING`;
    case 'empresa':
      return `INSERT INTO ${s}.empresa
        SELECT cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel, nullif(replace(capital_social, ',', '.'), '')::numeric, porte, nullif(trim(ente_federativo), '')
        FROM ${s}.stg_empresa t ${ofLoaded}
        ON CONFLICT (cnpj_basico) DO NOTHING`;
    case 'socio':
      return `INSERT INTO ${s}.socio
        SELECT cnpj_basico, tipo, nullif(trim(nome), ''), nullif(trim(documento), ''), qualificacao, ${DATE('data_entrada', s)}, nullif(faixa_etaria, '0')
        FROM ${s}.stg_socio t ${ofLoaded}`;
    case 'simples':
      return `INSERT INTO ${s}.simples
        SELECT cnpj_basico, opcao_simples = 'S', ${DATE('data_opcao_simples', s)}, ${DATE('data_exclusao_simples', s)}, opcao_mei = 'S', ${DATE('data_opcao_mei', s)}, ${DATE('data_exclusao_mei', s)}
        FROM ${s}.stg_simples t ${ofLoaded}
        ON CONFLICT (cnpj_basico) DO NOTHING`;
    default:
      return `INSERT INTO ${s}.${kind} SELECT codigo, descricao FROM ${s}.stg_${kind} ON CONFLICT (codigo) DO NOTHING`;
  }
}

/** Ordem importa: com filtro de UF, empresas/sócios/Simples só entram se o estabelecimento entrou. */
const ORDER: FileKind[] = ['cnae', 'municipio', 'natureza', 'qualificacao', 'estabelecimento', 'empresa', 'socio', 'simples'];

export interface ImportOptions {
  dir: string;
  /** AAAA-MM do arquivo da Receita. */
  month: string;
  /** UFs a manter (ex.: ["SP"]). Vazio = Brasil inteiro (dezenas de GB). */
  ufs?: string[];
  url?: string;
}

export async function importCnpj(opts: ImportOptions) {
  if (!existsSync(opts.dir)) throw new Error(`Pasta não encontrada: ${opts.dir}`);
  const ufs = (opts.ufs ?? []).map((u) => u.trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u));
  const missing = (['estabelecimento', 'empresa', 'socio'] as FileKind[]).filter((k) => !filesFor(opts.dir, k).length);
  if (missing.length) throw new Error(`Faltam arquivos na pasta: ${missing.map((k) => FILES[k].prefix).join(', ')}`);

  const run = await db.cnpjImport.create({ data: { month: opts.month, ufs, status: 'RUNNING' } });
  const client = new Client({ connectionString: pgUrl(opts.url) });
  await client.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await client.query(`DROP SCHEMA IF EXISTS ${NEXT} CASCADE`);
    for (const sql of finalDdl(NEXT)) await client.query(sql);
    // Data da Receita (AAAAMMDD, "0" ou "00000000" = sem data); data impossível vira nula em vez de abortar a carga.
    await client.query(`CREATE FUNCTION ${NEXT}.to_dt(t text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
      BEGIN IF t IS NULL OR t !~ '^[0-9]{8}$' OR t = '00000000' THEN RETURN NULL; END IF; RETURN to_date(t, 'YYYYMMDD');
      EXCEPTION WHEN others THEN RETURN NULL; END $$`);

    for (const kind of ORDER) {
      const files = filesFor(opts.dir, kind);
      if (!files.length) continue;
      await client.query(stagingDdl(NEXT, kind));
      for (const file of files) {
        await client.query(`TRUNCATE ${NEXT}.stg_${kind}`);
        const copy = client.query(copyFrom(`COPY ${NEXT}.stg_${kind} (${FILES[kind].columns.join(', ')}) FROM STDIN WITH (FORMAT csv, DELIMITER ';', QUOTE '"', ENCODING 'LATIN1')`));
        await pipeline(openFile(file), copy);
        const r = await client.query(transformSql(NEXT, kind, ufs));
        counts[kind] = (counts[kind] ?? 0) + (r.rowCount ?? 0);
        logger.info('cnpj.import.file', { file: path.basename(file), kind, rows: r.rowCount });
      }
      await client.query(`DROP TABLE ${NEXT}.stg_${kind}`);
    }
    for (const sql of indexDdl(NEXT)) await client.query(sql);
    await client.query(`INSERT INTO ${NEXT}.meta VALUES ('mes', $1), ('ufs', $2), ('importado_em', $3), ('contagens', $4)`, [opts.month, ufs.join(','), new Date().toISOString(), JSON.stringify(counts)]);
    await client.query(`ANALYZE ${NEXT}.estabelecimento; ANALYZE ${NEXT}.empresa; ANALYZE ${NEXT}.socio`);

    // Troca atômica: quem consulta vê o mês antigo inteiro ou o novo inteiro, nunca a metade.
    await client.query('BEGIN');
    await client.query(`DROP SCHEMA IF EXISTS ${PREVIOUS} CASCADE`);
    const live = await client.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [LIVE]);
    if (live.rowCount) await client.query(`ALTER SCHEMA ${LIVE} RENAME TO ${PREVIOUS}`);
    await client.query(`ALTER SCHEMA ${NEXT} RENAME TO ${LIVE}`);
    await client.query('COMMIT');

    await db.cnpjImport.update({ where: { id: run.id }, data: { status: 'DONE', counts, finishedAt: new Date() } });
    return { id: run.id, month: opts.month, ufs, counts };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    await db.cnpjImport.update({ where: { id: run.id }, data: { status: 'FAILED', counts, error: String((e as Error).message ?? e).slice(0, 2000), finishedAt: new Date() } });
    throw e;
  } finally {
    await client.end();
  }
}

/** Arquivos de um mês na Receita (Empresas0..9, Estabelecimentos0..9, Socios0..9 e tabelas auxiliares). */
export const MONTH_FILES = [
  ...['Empresas', 'Estabelecimentos', 'Socios'].flatMap((p) => Array.from({ length: 10 }, (_, i) => `${p}${i}.zip`)),
  'Simples.zip',
  'Cnaes.zip',
  'Municipios.zip',
  'Naturezas.zip',
  'Qualificacoes.zip',
];
