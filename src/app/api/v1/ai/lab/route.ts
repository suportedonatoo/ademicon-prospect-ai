import { authed, body } from '@/lib/api';
import { labTest } from '@/modules/ai/lab.service';

/** POST /api/v1/ai/lab — AI Lab: testa uma versão de prompt sem afetar produção. */
export const POST = authed({ permission: 'ai.read', rate: 30 }, async ({ req, ctx }) => labTest(ctx, await body(req)));
