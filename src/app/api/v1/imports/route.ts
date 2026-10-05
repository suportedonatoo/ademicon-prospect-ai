import { authed } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { listImports, uploadImport } from '@/modules/imports/import.service';

/** GET /api/v1/imports — histórico de importações. */
export const GET = authed({ permission: 'lead.import' }, async ({ ctx }) => listImports(ctx));

/** POST /api/v1/imports — UPLOAD (multipart: file=CSV|XLSX, campaignId?) → sugere mapeamento. */
export const POST = authed({ permission: 'lead.import', rate: 20 }, async ({ req, ctx }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('Envie o arquivo no campo "file".');
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadImport(ctx, file.name, buffer, { campaignId: (form.get('campaignId') as string) || null });
});
