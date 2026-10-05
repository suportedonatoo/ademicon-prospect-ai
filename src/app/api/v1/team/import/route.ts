import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { importTeam } from '@/modules/team/team.service';

/** POST /api/v1/team/import — { csv } planilha: nome; email; unidade; whatsapp1 … whatsapp6. */
export const POST = authed({ permission: 'consultant.manage', rate: 10 }, async ({ req, ctx }) => {
  const { csv, dailyLimit } = z.object({ csv: z.string().max(500_000), dailyLimit: z.coerce.number().int().min(1).max(100000).optional() }).parse(await body(req));
  return importTeam(ctx, csv, { dailyLimit });
});
