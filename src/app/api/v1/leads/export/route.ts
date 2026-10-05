import { authed, query } from '@/lib/api';
import { exportLeads } from '@/modules/leads/export.service';

/** GET /api/v1/leads/export?format=csv|xlsx&<filtros> — exportação auditada. */
export const GET = authed({ permission: 'lead.export', rate: 20 }, async ({ req, ctx }) => {
  const q = query(req);
  const format = q.format === 'xlsx' ? 'xlsx' : 'csv';
  const file = await exportLeads(ctx, { ...q, pageSize: 200 }, format);
  return new Response(new Uint8Array(file.body), {
    headers: { 'content-type': file.contentType, 'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.${file.ext}"` },
  });
});
