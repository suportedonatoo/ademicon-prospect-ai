import { FILES, type FileKind } from './layout';

// Estrutura da base CNPJ num schema próprio (fora do Prisma). A carga do mês vai para "cnpj_next";
// a troca é um RENAME de schema dentro de uma transação: cnpj → cnpj_anterior, cnpj_next → cnpj.

export const LIVE = 'cnpj';
export const NEXT = 'cnpj_next';
export const PREVIOUS = 'cnpj_anterior';

/** Tabelas de carga: tudo texto, exatamente como vem no CSV. */
export const stagingDdl = (schema: string, kind: FileKind) =>
  `CREATE UNLOGGED TABLE IF NOT EXISTS ${schema}.stg_${kind} (${FILES[kind].columns.map((c) => `${c} text`).join(', ')})`;

/** Tabelas finais, já tipadas. */
export function finalDdl(schema: string) {
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schema}`,
    `CREATE TABLE IF NOT EXISTS ${schema}.empresa (
      cnpj_basico text PRIMARY KEY, razao_social text, natureza_juridica text, qualificacao_responsavel text,
      capital_social numeric, porte text, ente_federativo text)`,
    `CREATE TABLE IF NOT EXISTS ${schema}.estabelecimento (
      cnpj text PRIMARY KEY, cnpj_basico text NOT NULL, matriz boolean, nome_fantasia text, situacao text, data_situacao date,
      motivo_situacao text, data_inicio date, cnae_principal text, cnaes_secundarios text[], tipo_logradouro text, logradouro text,
      numero text, complemento text, bairro text, cep text, uf text, municipio text, telefone1 text, telefone2 text, email text)`,
    `CREATE TABLE IF NOT EXISTS ${schema}.socio (
      cnpj_basico text NOT NULL, tipo text, nome text, documento text, qualificacao text, data_entrada date, faixa_etaria text)`,
    `CREATE TABLE IF NOT EXISTS ${schema}.simples (
      cnpj_basico text PRIMARY KEY, opcao_simples boolean, data_opcao_simples date, data_exclusao_simples date,
      opcao_mei boolean, data_opcao_mei date, data_exclusao_mei date)`,
    ...(['cnae', 'municipio', 'natureza', 'qualificacao'] as const).map((t) => `CREATE TABLE IF NOT EXISTS ${schema}.${t} (codigo text PRIMARY KEY, descricao text)`),
    `CREATE TABLE IF NOT EXISTS ${schema}.meta (chave text PRIMARY KEY, valor text)`,
  ];
}

/** Índices criados DEPOIS da carga (muito mais rápido que manter durante o COPY). */
export function indexDdl(schema: string) {
  return [
    `CREATE INDEX IF NOT EXISTS estab_basico ON ${schema}.estabelecimento (cnpj_basico)`,
    `CREATE INDEX IF NOT EXISTS estab_municipio ON ${schema}.estabelecimento (municipio)`,
    `CREATE INDEX IF NOT EXISTS estab_cnae ON ${schema}.estabelecimento (cnae_principal)`,
    `CREATE INDEX IF NOT EXISTS estab_inicio ON ${schema}.estabelecimento (municipio, data_inicio)`,
    // Casamento Google → CNPJ (Fase 2): telefone pelos últimos 8 dígitos e nome por trigramas.
    `CREATE INDEX IF NOT EXISTS estab_tel1 ON ${schema}.estabelecimento (right(telefone1, 8))`,
    `CREATE INDEX IF NOT EXISTS estab_fantasia_trgm ON ${schema}.estabelecimento USING gin (nome_fantasia gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS empresa_razao_trgm ON ${schema}.empresa USING gin (razao_social gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS socio_basico ON ${schema}.socio (cnpj_basico)`,
    `CREATE INDEX IF NOT EXISTS socio_pessoa ON ${schema}.socio (nome, documento)`,
  ];
}
