import { authed, body } from '@/lib/api';
import { saveAiProfile } from '@/modules/consultants/consultant.service';

/** PUT /api/v1/consultants/:id/ai-profile — IA do consultor (o próprio consultor ou a gestão). */
export const PUT = authed<{ id: string }>({}, async ({ req, ctx, params }) => saveAiProfile(ctx, params.id, await body(req)));
