import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setPlaybookStatus } from '@/modules/playbooks/playbook.service';

/** POST /api/v1/playbooks/:key/status — { version, status: ACTIVE | ARCHIVED | DRAFT } (ativar arquiva a anterior). */
export const POST = authed<{ key: string }>({ permission: 'ai.configure' }, async ({ req, ctx, params }) => {
  const i = z.object({ version: z.number().int().min(1), status: z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']) }).parse(await body(req));
  return setPlaybookStatus(ctx, params.key, i.version, i.status);
});
