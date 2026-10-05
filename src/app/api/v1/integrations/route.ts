import { authed } from '@/lib/api';
import { integrationStatus } from '@/modules/integrations/registry';

/** GET /api/v1/integrations — status de cada provider (mock / real / placeholder) com health check. */
export const GET = authed({ permission: 'integration.read' }, async ({ ctx }) => integrationStatus(ctx));
