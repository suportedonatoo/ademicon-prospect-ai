import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import { normalizeCnpj, normalizeEmail, normalizePhone, parseMoney } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { getStorageProvider } from '../storage/storage.provider';
import { findDuplicate, identityKeys } from '../leads/dedup';
import { ingestLead } from '../leads/lead-engine';
import { PRODUCT_KEYS } from '../leads/catalog';
import { extractSlots } from '../ai/nlu';

// UPLOAD → MAPEAMENTO → VALIDAÇÃO → PRÉVIA → DEDUPLICAÇÃO → IMPORTAÇÃO → RELATÓRIO

export const IMPORT_FIELDS = {
  name: 'Nome',
  phone: 'Telefone/WhatsApp',
  email: 'E-mail',
  company: 'Empresa',
  cnpj: 'CNPJ',
  city: 'Cidade',
  uf: 'UF',
  product: 'Produto',
  objective: 'Objetivo',
  desiredValue: 'Valor desejado',
  externalId: 'ID externo',
} as const;
type Field = keyof typeof IMPORT_FIELDS;

const HEADER_HINTS: Record<Field, RegExp> = {
  name: /^(nome|name|cliente|contato|nome completo)$/i,
  phone: /(telefone|celular|whats|fone|phone|tel)/i,
  email: /(e-?mail)/i,
  company: /(empresa|raz[aã]o|company)/i,
  cnpj: /cnpj/i,
  city: /(cidade|munic[ií]pio|city)/i,
  uf: /^(uf|estado|state)$/i,
  product: /(produto|interesse|product)/i,
  objective: /(objetivo|finalidade)/i,
  desiredValue: /(valor|cr[eé]dito|carta)/i,
  externalId: /^(id|c[oó]digo|external)/i,
};

export const MAX_ROWS = 20000;

async function parseFile(fileName: string, buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[]; type: 'CSV' | 'XLSX' }> {
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw BadRequest('Planilha vazia.');
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => (headers[col - 1] = String(cell.text || `Coluna ${col}`).trim()));
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const r: Record<string, string> = {};
      headers.forEach((h, i) => (r[h] = String(row.getCell(i + 1).text ?? '').trim()));
      if (Object.values(r).some(Boolean)) rows.push(r);
    });
    return { headers, rows, type: 'XLSX' };
  }
  if (/\.csv$/i.test(fileName)) {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim(), delimitersToGuess: [',', ';', '\t'] });
    return { headers: parsed.meta.fields ?? [], rows: parsed.data, type: 'CSV' };
  }
  throw BadRequest('Formato não suportado. Envie CSV ou XLSX.');
}

export function suggestMapping(headers: string[]): Partial<Record<Field, string>> {
  const mapping: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(HEADER_HINTS) as Field[]) {
    const h = headers.find((x) => HEADER_HINTS[field].test(x.trim()) && !Object.values(mapping).includes(x));
    if (h) mapping[field] = h;
  }
  return mapping;
}

function toProduct(v: string): string | null {
  const up = v.trim().toUpperCase().replace(/\s+/g, '_');
  if ((PRODUCT_KEYS as string[]).includes(up)) return up;
  return extractSlots(v).product ?? null;
}

export async function uploadImport(ctx: Ctx, fileName: string, buffer: Buffer, opts: { campaignId?: string | null } = {}) {
  assertCan(ctx, 'lead.import');
  if (buffer.length > 10 * 1024 * 1024) throw BadRequest('Arquivo acima de 10 MB.');
  const { headers, rows, type } = await parseFile(fileName, buffer);
  if (!rows.length) throw BadRequest('Nenhuma linha encontrada.');
  if (rows.length > MAX_ROWS) throw BadRequest(`Limite de ${MAX_ROWS} linhas por importação.`);
  const job = await db.importJob.create({
    data: { organizationId: ctx.orgId, fileName, fileType: type, headers, mapping: suggestMapping(headers), totalRows: rows.length, createdById: ctx.userId, campaignId: opts.campaignId ?? null },
  });
  await getStorageProvider().put(`imports/${ctx.orgId}/${job.id}-${fileName.replace(/[^\w.-]/g, '_')}`, buffer);
  for (let i = 0; i < rows.length; i += 1000) {
    await db.importRow.createMany({ data: rows.slice(i, i + 1000).map((raw, j) => ({ organizationId: ctx.orgId, jobId: job.id, rowNumber: i + j + 2, raw })) });
  }
  return job;
}

export const mappingSchema = z.record(z.enum(Object.keys(IMPORT_FIELDS) as [Field, ...Field[]]), z.string()).refine((m) => !!m.name, 'Mapeie a coluna de Nome.');

/** MAPEAMENTO + VALIDAÇÃO + DEDUPLICAÇÃO (prévia, sem gravar leads). */
export async function validateImport(ctx: Ctx, jobId: string, rawMapping: unknown) {
  assertCan(ctx, 'lead.import');
  const mapping = mappingSchema.parse(rawMapping);
  const job = await db.importJob.findFirst({ where: { id: jobId, organizationId: ctx.orgId } });
  if (!job) throw NotFound('Importação');
  if (['IMPORTING', 'COMPLETED'].includes(job.status)) throw BadRequest('Importação já executada.');
  const rows = await db.importRow.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' } });
  const seen = new Set<string>();
  let valid = 0, invalid = 0, inFileDup = 0, existing = 0;

  for (const row of rows) {
    const raw = row.raw as Record<string, string>;
    const get = (f: Field) => (mapping[f] ? String(raw[mapping[f]!] ?? '').trim() : '');
    const errors: string[] = [];
    const n = {
      name: get('name'),
      phone: normalizePhone(get('phone')),
      email: normalizeEmail(get('email')),
      cnpj: normalizeCnpj(get('cnpj')),
      company: get('company') || null,
      city: get('city') || null,
      uf: get('uf').toUpperCase().slice(0, 2) || null,
      product: get('product') ? toProduct(get('product')) : null,
      objective: get('objective') || null,
      desiredValue: parseMoney(get('desiredValue')),
      externalId: get('externalId') || null,
    };
    if (n.name.length < 2) errors.push('Nome ausente');
    if (get('phone') && !n.phone) errors.push('Telefone inválido');
    if (get('email') && !n.email) errors.push('E-mail inválido');
    if (!n.phone && !n.email && !n.cnpj) errors.push('Sem telefone, e-mail ou CNPJ');
    if (get('product') && !n.product) errors.push(`Produto não reconhecido: "${get('product')}"`);

    let status = 'VALID';
    if (errors.length) {
      status = 'INVALID';
      invalid++;
    } else {
      const keys = identityKeys({ ...n, source: 'IMPORT' });
      const fileKey = keys.map((k) => `${k.type}:${k.value}`);
      if (fileKey.some((k) => seen.has(k))) {
        status = 'DUPLICATE';
        inFileDup++;
      } else {
        fileKey.forEach((k) => seen.add(k));
        const dup = await findDuplicate(ctx.orgId, keys);
        if (dup) existing++;
        valid++;
      }
    }
    await db.importRow.update({ where: { id: row.id }, data: { normalized: n, status, errors } });
  }

  await db.importJob.update({ where: { id: jobId }, data: { mapping, status: 'VALIDATED', duplicateCount: inFileDup, errorCount: invalid } });
  return { total: rows.length, valid, invalid, duplicatesInFile: inFileDup, willCreate: valid - existing, willUpdate: existing };
}

/** IMPORTAÇÃO + RELATÓRIO. */
export async function executeImport(ctx: Ctx, jobId: string) {
  assertCan(ctx, 'lead.import');
  const job = await db.importJob.findFirst({ where: { id: jobId, organizationId: ctx.orgId } });
  if (!job) throw NotFound('Importação');
  if (job.status !== 'VALIDATED') throw BadRequest('Valide a importação antes de executar.');
  await db.importJob.update({ where: { id: jobId }, data: { status: 'IMPORTING' } });
  const rows = await db.importRow.findMany({ where: { jobId, status: 'VALID' }, orderBy: { rowNumber: 'asc' } });
  let created = 0, updated = 0, errors = job.errorCount;

  for (const row of rows) {
    const n = row.normalized as Record<string, string | number | null>;
    try {
      const res = await ingestLead(ctx, {
        ...n,
        source: 'IMPORT',
        medium: 'planilha',
        campaignId: job.campaignId,
        dataOrigin: `Importação de base própria (${job.fileName}) — sem consentimento registrado para mensagens`,
        payload: { importJobId: job.id, row: row.rowNumber },
      }, { lightweight: true });
      await db.importRow.update({ where: { id: row.id }, data: { status: res.deduplicated ? 'UPDATED' : 'NEW', leadId: res.leadId } });
      if (res.deduplicated) updated++;
      else created++;
    } catch (e) {
      errors++;
      await db.importRow.update({ where: { id: row.id }, data: { status: 'ERROR', errors: [String((e as Error).message).slice(0, 200)] } });
    }
  }

  const done = await db.importJob.update({
    where: { id: jobId },
    data: { status: 'COMPLETED', newCount: created, updatedCount: updated, errorCount: errors, completedAt: new Date() },
  });
  await audit(ctx, 'import.executed', { type: 'ImportJob', id: jobId }, { file: job.fileName, created, updated, duplicates: job.duplicateCount, errors });
  return done;
}

export async function getImport(ctx: Ctx, jobId: string) {
  assertCan(ctx, 'lead.import');
  const job = await db.importJob.findFirst({ where: { id: jobId, organizationId: ctx.orgId } });
  if (!job) throw NotFound('Importação');
  const [preview, byStatus] = await Promise.all([
    db.importRow.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' }, take: 25 }),
    db.importRow.groupBy({ by: ['status'], where: { jobId }, _count: { _all: true } }),
  ]);
  return { job, preview, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
}

export async function listImports(ctx: Ctx) {
  assertCan(ctx, 'lead.import');
  return db.importJob.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' }, take: 50 });
}
