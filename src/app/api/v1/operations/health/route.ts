import { authed } from '@/lib/api';
import { operationHealth } from '@/modules/operations/operations.service';

/** GET /api/v1/operations/health — Operation Health Center (status derivados de métricas reais). */
export const GET = authed({ permission: 'integration.read' }, async ({ ctx }) => operationHealth(ctx));
