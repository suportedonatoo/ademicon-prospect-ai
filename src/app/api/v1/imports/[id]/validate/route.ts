import { authed, body } from '@/lib/api';
import { validateImport } from '@/modules/imports/import.service';

/** POST /api/v1/imports/:id/validate — { mapping } → validação + deduplicação (prévia). */
export const POST = authed<{ id: string }>({ permission: 'lead.import', rate: 30 }, async ({ req, ctx, params }) => {
  const input = await body<{ mapping: unknown }>(req);
  return validateImport(ctx, params.id, input.mapping);
});
