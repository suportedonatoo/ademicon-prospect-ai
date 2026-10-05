import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { experimentResults, setExperimentStatus } from '@/modules/experiments/experiment.service';

/** GET /api/v1/experiments/:id — resultados por variante (funil de negócio + IC 95%). */
export const GET = authed<{ id: string }>({ permission: 'campaign.read' }, async ({ ctx, params }) => experimentResults(ctx, params.id));

/** POST /api/v1/experiments/:id — { status: RUNNING | PAUSED | COMPLETED }. */
export const POST = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['RUNNING', 'PAUSED', 'COMPLETED']) }).parse(await body(req));
  return setExperimentStatus(ctx, params.id, status);
});
