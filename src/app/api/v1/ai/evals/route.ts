import { authed, body } from '@/lib/api';
import { listDatasets, runEvaluation } from '@/modules/ai/lab.service';

/** GET /api/v1/ai/evals — datasets de avaliação com os últimos resultados. */
export const GET = authed({ permission: 'ai.read' }, async ({ ctx }) => listDatasets(ctx));

/** POST /api/v1/ai/evals — executa um dataset: { datasetId, agentKey, promptVersionId? }. */
export const POST = authed({ permission: 'ai.configure', rate: 10 }, async ({ req, ctx }) => runEvaluation(ctx, await body(req)));
