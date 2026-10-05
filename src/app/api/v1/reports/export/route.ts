import { authed, query } from '@/lib/api';
import { exportReport, parseSpec } from '@/modules/reports/report.service';

/** GET /api/v1/reports/export?format=csv|xlsx&<spec> — exportação auditada (permissão lead.export). */
export const GET = authed({ permission: 'lead.export', rate: 20 }, async ({ req, ctx }) => {
  const q = query(req);
  const format = q.format === 'xlsx' ? 'xlsx' : 'csv';
  const file = await exportReport(ctx, parseSpec(q), format);
  return new Response(new Uint8Array(file.body), {
    headers: { 'content-type': file.contentType, 'content-disposition': `attachment; filename="relatorio-${new Date().toISOString().slice(0, 10)}.${file.ext}"` },
  });
});
