import { authed } from '@/lib/api';
import { executeImport } from '@/modules/imports/import.service';

/** POST /api/v1/imports/:id/execute — importa as linhas válidas e gera o relatório. */
export const POST = authed<{ id: string }>({ permission: 'lead.import', rate: 10 }, async ({ ctx, params }) => executeImport(ctx, params.id));
