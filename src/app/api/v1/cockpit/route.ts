import { authed } from '@/lib/api';
import { supervisorCockpit } from '@/modules/operations/operations.service';

/** GET /api/v1/cockpit — Supervisor Cockpit: onde intervir agora. */
export const GET = authed({ permission: 'lead.read' }, async ({ ctx }) => supervisorCockpit(ctx));
