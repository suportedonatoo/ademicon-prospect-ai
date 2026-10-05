import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import { db } from '@/lib/db';
import { formatPhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope, opportunityScope } from '../leads/scope';
import { productLabel, sourceLabel, statusLabel, temperatureLabel } from '../leads/catalog';

// REPORT BUILDER (§78): entidade + colunas + filtros + agrupamento + período → tabela e exportação.
// Tudo respeita o escopo do perfil (ORG / PJ / OWN) e toda exportação vai para o AuditLog.

const PERIODS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const;
const MAX_ROWS_VIEW = 500;
const MAX_ROWS_EXPORT = 20000;

type Lead = Awaited<ReturnType<typeof loadLeads>>[number];
type Opp = Awaited<ReturnType<typeof loadOpps>>[number];

export const LEAD_COLUMNS: Record<string, { label: string; get: (l: Lead) => string | number }> = {
  code: { label: 'Código', get: (l) => l.code },
  name: { label: 'Nome', get: (l) => l.name },
  phone: { label: 'Telefone', get: (l) => formatPhone(l.phone) },
  email: { label: 'E-mail', get: (l) => l.email ?? '' },
  city: { label: 'Cidade', get: (l) => l.city ?? '' },
  product: { label: 'Produto', get: (l) => productLabel(l.product) },
  value: { label: 'Valor desejado', get: (l) => l.desiredValue ?? '' },
  score: { label: 'Score', get: (l) => l.score },
  temperature: { label: 'Temperatura', get: (l) => temperatureLabel(l.temperature) },
  status: { label: 'Status', get: (l) => statusLabel(l.status) },
  source: { label: 'Origem', get: (l) => sourceLabel(l.source) },
  campaign: { label: 'Campanha', get: (l) => l.campaign?.name ?? '' },
  pj: { label: 'PJ', get: (l) => l.pj?.code ?? '' },
  consultant: { label: 'Consultor', get: (l) => l.consultant?.name ?? '' },
  createdAt: { label: 'Criado em', get: (l) => l.createdAt.toISOString().slice(0, 10) },
};

export const OPP_COLUMNS: Record<string, { label: string; get: (o: Opp) => string | number }> = {
  code: { label: 'Código', get: (o) => o.code },
  lead: { label: 'Lead', get: (o) => o.lead.name },
  product: { label: 'Produto', get: (o) => productLabel(o.product) },
  value: { label: 'Valor', get: (o) => o.value },
  stage: { label: 'Etapa', get: (o) => o.stage.name },
  status: { label: 'Situação', get: (o) => ({ OPEN: 'Aberta', WON: 'Ganha', LOST: 'Perdida' })[o.status] ?? o.status },
  source: { label: 'Origem', get: (o) => sourceLabel(o.source) },
  pj: { label: 'PJ', get: (o) => o.pj?.code ?? '' },
  consultant: { label: 'Consultor', get: (o) => o.consultant?.name ?? '' },
  lostReason: { label: 'Motivo da perda', get: (o) => o.lostReason ?? '' },
  createdAt: { label: 'Criada em', get: (o) => o.createdAt.toISOString().slice(0, 10) },
  closedAt: { label: 'Fechada em', get: (o) => o.closedAt?.toISOString().slice(0, 10) ?? '' },
};

const GROUPS = {
  LEADS: { source: 'Origem', product: 'Produto', temperature: 'Temperatura', status: 'Status', pj: 'PJ', consultant: 'Consultor', campaign: 'Campanha' },
  OPPORTUNITIES: { source: 'Origem', product: 'Produto', stage: 'Etapa', status: 'Situação', pj: 'PJ', consultant: 'Consultor' },
} as const;

export const reportSpec = z.object({
  entity: z.enum(['LEADS', 'OPPORTUNITIES']).default('LEADS'),
  columns: z.array(z.string().max(30)).max(20).default([]),
  groupBy: z.string().max(30).optional().nullable(),
  period: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
  source: z.string().max(40).optional().nullable(),
  product: z.string().max(40).optional().nullable(),
  pjId: z.string().max(40).optional().nullable(),
  status: z.string().max(40).optional().nullable(),
  temperature: z.string().max(20).optional().nullable(),
});
export type ReportSpec = z.infer<typeof reportSpec>;

/** Converte a query string (?entity=&columns=a,b&…) no spec validado. */
export function parseSpec(q: Record<string, string | undefined>): ReportSpec {
  return reportSpec.parse({ ...q, columns: q.columns ? q.columns.split(',').filter(Boolean) : [], groupBy: q.groupBy || null });
}

const since = (p: ReportSpec['period']) => new Date(Date.now() - PERIODS[p] * 86400_000);

function loadLeads(ctx: Ctx, s: ReportSpec, take: number) {
  return db.lead.findMany({
    where: {
      ...leadScope(ctx),
      createdAt: { gte: since(s.period) },
      ...(s.source ? { source: s.source } : {}),
      ...(s.product ? { product: s.product } : {}),
      ...(s.pjId ? { pjId: s.pjId } : {}),
      ...(s.status ? { status: s.status as never } : {}),
      ...(s.temperature ? { temperature: s.temperature } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { pj: { select: { code: true } }, consultant: { select: { name: true } }, campaign: { select: { name: true } } },
  });
}

function loadOpps(ctx: Ctx, s: ReportSpec, take: number) {
  return db.opportunity.findMany({
    where: {
      ...opportunityScope(ctx),
      createdAt: { gte: since(s.period) },
      ...(s.source ? { source: s.source } : {}),
      ...(s.product ? { product: s.product } : {}),
      ...(s.pjId ? { pjId: s.pjId } : {}),
      ...(s.status ? { status: s.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { lead: { select: { name: true } }, stage: { select: { name: true } }, pj: { select: { code: true } }, consultant: { select: { name: true } } },
  });
}

export interface ReportResult {
  entity: ReportSpec['entity'];
  headers: string[];
  rows: (string | number)[][];
  total: number;
  truncated: boolean;
  grouped: boolean;
}

export async function runReport(ctx: Ctx, s: ReportSpec, opts: { export?: boolean } = {}): Promise<ReportResult> {
  assertCan(ctx, s.entity === 'LEADS' ? 'lead.read' : 'opportunity.read');
  const limit = opts.export ? MAX_ROWS_EXPORT : MAX_ROWS_VIEW;
  const defs = (s.entity === 'LEADS' ? LEAD_COLUMNS : OPP_COLUMNS) as Record<string, { label: string; get: (r: never) => string | number }>;
  const records = (s.entity === 'LEADS' ? await loadLeads(ctx, s, limit + 1) : await loadOpps(ctx, s, limit + 1)) as unknown[];
  const truncated = records.length > limit;
  const data = records.slice(0, limit);

  const groups = GROUPS[s.entity] as Record<string, string>;
  if (s.groupBy && groups[s.groupBy]) {
    const col = defs[s.groupBy];
    const valueCol = defs.value;
    const agg = new Map<string, { count: number; value: number }>();
    for (const r of data) {
      const k = String(col.get(r as never) || '(vazio)');
      const a = agg.get(k) ?? { count: 0, value: 0 };
      a.count++;
      a.value += Number(valueCol.get(r as never)) || 0;
      agg.set(k, a);
    }
    const rows = [...agg.entries()].sort((a, b) => b[1].count - a[1].count).map(([k, a]) => [k, a.count, Math.round(a.value), a.count ? Math.round(a.value / a.count) : 0]);
    return { entity: s.entity, headers: [groups[s.groupBy], 'Quantidade', 'Valor total', 'Valor médio'], rows, total: data.length, truncated, grouped: true };
  }

  const keys = (s.columns.length ? s.columns : Object.keys(defs).slice(0, 8)).filter((c) => defs[c]);
  return { entity: s.entity, headers: keys.map((k) => defs[k].label), rows: data.map((r) => keys.map((k) => defs[k].get(r as never))), total: data.length, truncated, grouped: false };
}

export async function exportReport(ctx: Ctx, s: ReportSpec, format: 'csv' | 'xlsx') {
  assertCan(ctx, 'lead.export');
  const r = await runReport(ctx, s, { export: true });
  await audit(ctx, 'export.executed', { type: 'Report' }, { format, entity: s.entity, count: r.rows.length, spec: s });
  const objects = r.rows.map((row) => Object.fromEntries(r.headers.map((h, i) => [h, row[i]])));
  if (format === 'csv') return { body: Buffer.from('﻿' + Papa.unparse({ fields: r.headers, data: r.rows }, { delimiter: ';' }), 'utf8'), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Relatório');
  ws.columns = r.headers.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 2) }));
  ws.addRows(objects);
  ws.getRow(1).font = { bold: true };
  return { body: Buffer.from(await wb.xlsx.writeBuffer()), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

export const REPORT_OPTIONS = {
  columns: { LEADS: Object.fromEntries(Object.entries(LEAD_COLUMNS).map(([k, v]) => [k, v.label])), OPPORTUNITIES: Object.fromEntries(Object.entries(OPP_COLUMNS).map(([k, v]) => [k, v.label])) },
  groups: GROUPS,
};
