import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { importCnpj } from '@/modules/cnpj/importer';
import { CachedBrasilApiProvider, LayeredCnpjProvider, LocalCnpjProvider, snapshotInfo } from '@/modules/cnpj/cnpj.provider';
import ids from '../fixtures/cnpj/cnpjs.json';

const FIX = path.resolve(__dirname, '../fixtures/cnpj');

/** Os mesmos CSVs, mas em ZIPs como a Receita publica (testa o caminho do unzip). */
function zipped(month: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cnpj-'));
  for (const f of readdirSync(path.join(FIX, month))) execFileSync('zip', ['-jq', path.join(dir, f.replace(/\.csv$/, '.zip')), path.join(FIX, month, f)]);
  return dir;
}

beforeAll(async () => {
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS cnpj CASCADE');
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS cnpj_anterior CASCADE');
  await db.$executeRawUnsafe('DELETE FROM "CnpjImport"');
  await db.$executeRawUnsafe('DELETE FROM "CnpjCache"');
}, 60_000);

describe('Importação da base CNPJ', () => {
  it('sem base importada, a consulta local devolve null (cai na BrasilAPI)', async () => {
    expect(await snapshotInfo()).toBeNull();
    expect(await new LocalCnpjProvider().lookup(ids.matriz)).toBeNull();
  });

  it('importa dois meses (CSV e ZIP), só as UFs pedidas, e guarda o mês anterior', async () => {
    const sep = await importCnpj({ dir: path.join(FIX, '2026-09'), month: '2026-09', ufs: ['SP'] });
    expect(sep.counts).toEqual({ cnae: 4, municipio: 3, natureza: 2, qualificacao: 2, estabelecimento: 4, empresa: 3, socio: 3, simples: 2 }); // a empresa de MG ficou fora
    const out = await importCnpj({ dir: zipped('2026-10'), month: '2026-10', ufs: ['sp'] });
    expect(out.counts.estabelecimento).toBe(4);

    expect(await snapshotInfo()).toMatchObject({ month: '2026-10', ufs: 'SP' });
    const prev = await db.$queryRawUnsafe<{ capital_social: string }[]>(`SELECT capital_social::text FROM cnpj_anterior.empresa WHERE cnpj_basico = $1`, ids.matriz.slice(0, 8));
    expect(Number(prev[0].capital_social)).toBe(300000); // mês anterior intacto para os gatilhos
    expect(await db.cnpjImport.count({ where: { status: 'DONE' } })).toBe(2);
  });

  it('consulta local: cadastro completo, acentos (LATIN1), sócios com CPF mascarado', async () => {
    const r = (await new LocalCnpjProvider().lookup(ids.matriz))!;
    expect(r).toMatchObject({
      cnpj: ids.matriz,
      matriz: true,
      legalName: 'TRANSPORTES HORIZONTE LTDA',
      tradeName: 'TRANSPORTES HORIZONTE',
      situation: 'ATIVA',
      size: 'EMPRESA DE PEQUENO PORTE',
      shareCapital: 500000,
      city: 'JUNDIAÍ',
      uf: 'SP',
      phone: '11987654321',
      phone2: '1145215000',
      email: 'contato@horizonte.com.br',
      openedAt: '2018-03-10',
      legalNature: '2062 - Sociedade Empresária Limitada',
      address: 'RUA DAS PALMEIRAS 1699 GALPÃO 2',
      simples: true,
      mei: false,
    });
    expect(r.cnae).toMatch(/^4930-2\/02 · Transporte rodoviário/);
    expect(r.secondaryCnaes).toEqual([{ code: '5211-7/99', description: 'Depósitos de mercadorias para terceiros' }, { code: '7319-0/02', description: undefined }]);
    expect(r.partners).toEqual([
      { name: 'FERNANDA ROCHA', role: 'Sócio-Administrador', since: '2018-03-10', ageRange: '41 a 50 anos', document: '***123456**' },
      { name: 'MARCOS ALMEIDA', role: 'Sócio', since: '2020-06-01', ageRange: '51 a 60 anos', document: '***654321**' },
    ]);
    expect((await new LocalCnpjProvider().lookup(ids.filial))?.matriz).toBe(false);
    expect((await new LocalCnpjProvider().lookup(ids.alfanumerico))?.legalName).toBe('ODONTO NOVA LTDA');
    expect((await new LocalCnpjProvider().lookup(ids.baixada))?.situation).toBe('BAIXADA');
    expect(await new LocalCnpjProvider().lookup(ids.mg)).toBeNull(); // fora das UFs importadas
  });

  it('importação que falha não mexe na base em uso', async () => {
    await expect(importCnpj({ dir: path.join(FIX, 'nao-existe'), month: '2026-11', ufs: ['SP'] })).rejects.toThrow(/Pasta não encontrada/);
    const empty = mkdtempSync(path.join(os.tmpdir(), 'cnpj-vazio-'));
    await expect(importCnpj({ dir: empty, month: '2026-11', ufs: ['SP'] })).rejects.toThrow(/Faltam arquivos/);
    expect((await snapshotInfo())?.month).toBe('2026-10');
  });
});

describe('Consulta em camadas', () => {
  it('base local primeiro; fora dela, BrasilAPI com cache no banco; CNPJ inválido nem consulta', async () => {
    let apiCalls = 0;
    const api = { lookupCnpj: async (c: string) => (apiCalls++, { legalName: `DA API ${c}`, situation: 'ATIVA' }) };
    const mk = () => new LayeredCnpjProvider([new LocalCnpjProvider(), new CachedBrasilApiProvider(api)]);

    expect((await mk().lookup(ids.matriz))?.source).toBe('Base CNPJ da Receita (local)');
    expect(apiCalls).toBe(0);

    const mg = await mk().lookup('44.555.666/0001-81');
    expect(mg).toMatchObject({ legalName: `DA API ${ids.mg}`, source: 'BrasilAPI' });
    expect(await mk().lookup(ids.mg)).toMatchObject({ source: 'BrasilAPI' }); // outra instância: veio do cache do banco
    expect(apiCalls).toBe(1);

    expect(await mk().lookup('11222333000182')).toBeNull();
    expect(apiCalls).toBe(1);
  });

  it('consulta repetida responde em menos de 100 ms (cache em memória)', async () => {
    const p = new LayeredCnpjProvider([new LocalCnpjProvider()]);
    await p.lookup(ids.matriz);
    const t = performance.now();
    for (let i = 0; i < 100; i++) await p.lookup(ids.matriz);
    expect((performance.now() - t) / 100).toBeLessThan(100);
    // sem memória (primeira consulta numa instância nova) também fica abaixo de 100 ms na base local
    const t2 = performance.now();
    await new LayeredCnpjProvider([new LocalCnpjProvider()]).lookup(ids.filial);
    expect(performance.now() - t2).toBeLessThan(100);
  });
});
