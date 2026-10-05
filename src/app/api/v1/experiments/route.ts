import { authed, body } from '@/lib/api';
import { createExperiment, listExperiments } from '@/modules/experiments/experiment.service';
import { assertFlag } from '@/modules/organizations/flags.service';

export const GET = authed({ permission: 'campaign.read' }, async ({ ctx }) => listExperiments(ctx));

/** POST /api/v1/experiments — cria experimento A/B com variantes e pesos. */
export const POST = authed({ permission: 'campaign.create' }, async ({ req, ctx }) => {
  await assertFlag(ctx.orgId, 'EXPERIMENTS');
  return createExperiment(ctx, await body(req));
});
