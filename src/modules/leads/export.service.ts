import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { db } from '@/lib/db';
import { formatPhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadFilterSchema, leadWhere } from './leads.service';
import { productLabel, sourceLabel, statusLabel, temperatureLabel } from './catalog';

const MAX_EXPORT = 20000;

/** Exporta leads (conforme permissão e escopo). Toda exportação vai para o AuditLog. */
export async function exportLeads(ctx: Ctx, rawFilters: unknown, format: 'csv' | 'xlsx') {
  assertCan(ctx, 'lead.export');
  const f = leadFilterSchema.parse(rawFilters ?? {});
  const leads = await db.lead.findMany({
    where: leadWhere(ctx, f),
    orderBy: { createdAt: 'desc' },
    take: MAX_EXPORT,
    include: { pj: { select: { code: true } }, consultant: { select: { name: true } }, campaign: { select: { name: true } } },
  });
  const rows = leads.map((l) => ({
    Código: l.code,
    Nome: l.name,
    Telefone: formatPhone(l.phone),
    'E-mail': l.email ?? '',
    Empresa: l.company ?? '',
    Cidade: l.city ?? '',
    UF: l.uf ?? '',
    Produto: productLabel(l.product),
    'Valor desejado': l.desiredValue ?? '',
    Score: l.score,
    Temperatura: temperatureLabel(l.temperature),
    Status: statusLabel(l.status),
    Origem: sourceLabel(l.source),
    Campanha: l.campaign?.name ?? '',
    PJ: l.pj?.code ?? '',
    Consultor: l.consultant?.name ?? '',
    'Opt-out': l.optOut ? 'Sim' : 'Não',
    'Criado em': l.createdAt.toISOString(),
  }));
  await audit(ctx, 'export.executed', { type: 'Lead' }, { format, count: rows.length, filters: f });

  if (format === 'csv') {
    return { body: Buffer.from('﻿' + Papa.unparse(rows, { delimiter: ';' }), 'utf8'), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Leads');
  ws.columns = Object.keys(rows[0] ?? { Código: '' }).map((k) => ({ header: k, key: k, width: Math.max(12, k.length + 2) }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { body: buf, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}
