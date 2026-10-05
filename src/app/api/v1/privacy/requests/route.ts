import { authed, body } from '@/lib/api';
import { openDataRequest } from '@/modules/privacy/privacy.service';

/** POST /api/v1/privacy/requests — abre solicitação do titular (acesso, correção, exclusão...). */
export const POST = authed({ permission: 'privacy.manage' }, async ({ req, ctx }) => openDataRequest(ctx, await body(req)));
