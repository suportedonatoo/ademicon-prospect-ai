import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setInsightStatus } from '@/modules/insights/insights.service';

export const PATCH = authed<{ id: string }>({ permission: 'analytics.read' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'DISMISSED']) }).parse(await body(req));
  return setInsightStatus(ctx, params.id, status);
});
