import { authed } from '@/lib/api';
import { getDefaultPipeline } from '@/modules/pipelines/pipeline.service';

/** GET /api/v1/pipelines — pipeline padrão e etapas. */
export const GET = authed({ permission: 'opportunity.read' }, async ({ ctx }) => [await getDefaultPipeline(ctx.orgId)]);
