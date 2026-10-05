import { authed, body } from '@/lib/api';
import { listTeam, onboardMember } from '@/modules/team/team.service';

/** GET/POST /api/v1/team — equipe: cadastra pessoa (login + consultor + números) de uma vez. */
export const GET = authed({ permission: 'consultant.manage' }, async ({ ctx }) => listTeam(ctx));
export const POST = authed({ permission: 'consultant.manage', idempotent: true }, async ({ req, ctx }) => onboardMember(ctx, await body(req)));
