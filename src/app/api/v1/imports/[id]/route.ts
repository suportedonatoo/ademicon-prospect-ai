import { authed } from '@/lib/api';
import { getImport } from '@/modules/imports/import.service';

/** GET /api/v1/imports/:id — job, prévia das linhas e contagem por status. */
export const GET = authed<{ id: string }>({ permission: 'lead.import' }, async ({ ctx, params }) => getImport(ctx, params.id));
