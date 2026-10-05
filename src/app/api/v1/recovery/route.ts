import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { executeRecovery, recoveryCenter } from '@/modules/recovery/recovery.service';

/** GET /api/v1/recovery — Lead Recovery Center (filas: agora · hoje · nutrir). */
export const GET = authed({ permission: 'lead.read' }, async ({ ctx }) => recoveryCenter(ctx));

/** POST /api/v1/recovery — iniciar recuperação (cria tarefa + registro auditado). */
export const POST = authed({ permission: 'task.create' }, async ({ req, ctx }) => {
  const i = z.object({ leadId: z.string(), reason: z.string().max(40) }).parse(await body(req));
  return executeRecovery(ctx, i.leadId, i.reason);
});
