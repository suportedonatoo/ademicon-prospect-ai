import { authed } from '@/lib/api';
import { consultantCapacity } from '@/modules/operations/operations.service';

/** GET /api/v1/operations/capacity — Capacity Intelligence por consultor. */
export const GET = authed({ permission: 'consultant.read' }, async ({ ctx }) => consultantCapacity(ctx));
