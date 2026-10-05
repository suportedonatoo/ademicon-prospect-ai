import { authed, body } from '@/lib/api';
import { createTrackedLink } from '@/modules/outreach/outreach.service';

/** POST /api/v1/divulgacao/links — novo canal rastreado ou link de indicação { kind, name, network?, target? }. */
export const POST = authed({ rate: 60 }, async ({ req, ctx }) => createTrackedLink(ctx, await body(req)));
