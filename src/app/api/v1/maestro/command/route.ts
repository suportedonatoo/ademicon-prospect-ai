import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { maestroCommand } from '@/modules/calendar/scheduling.service';

/** POST /api/v1/maestro/command — pedido em texto ao Maestro ({ text }): "agenda com Maria amanhã às 15h", "minhas reuniões". */
export const POST = authed({ rate: 30 }, async ({ req, ctx }) => {
  const i = z.object({ text: z.string().trim().min(3).max(300) }).parse(await body(req));
  return maestroCommand(ctx, i.text);
});
