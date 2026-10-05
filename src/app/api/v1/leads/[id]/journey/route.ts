import { authed } from '@/lib/api';
import { customerJourney } from '@/modules/coach/coach.service';

/** GET /api/v1/leads/:id/journey — Customer Journey: onde o lead está e onde parou. */
export const GET = authed<{ id: string }>({ permission: 'lead.read' }, async ({ ctx, params }) => customerJourney(ctx, params.id));
