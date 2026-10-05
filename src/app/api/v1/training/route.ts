import { authed, body } from '@/lib/api';
import { listTraining, saveTraining } from '@/modules/training/training.service';

/** GET/POST /api/v1/training — trilha de treinamento (todos veem; Super Admin cadastra). */
export const GET = authed({}, async ({ ctx }) => listTraining(ctx));
export const POST = authed({ rate: 60 }, async ({ req, ctx }) => saveTraining(ctx, await body(req)));
