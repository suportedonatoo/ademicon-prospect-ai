import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { changeMemberLink, setMemberBrandAuthorized, setMemberActive } from '@/modules/team/team.service';

/**
 * PATCH /api/v1/team/:id
 *  { active }       desliga (sem leads, sem acesso) ou religa (volta empatado na divisão);
 *  { landingSlug }  troca o link próprio (subdomínio) do colaborador.
 */
export const PATCH = authed<{ id: string }>({ permission: 'consultant.manage' }, async ({ req, ctx, params }) => {
  const input = z.object({ active: z.boolean().optional(), landingSlug: z.string().max(63).optional(), brandAuthorized: z.boolean().optional() }).parse(await body(req));
  if (input.brandAuthorized !== undefined) return setMemberBrandAuthorized(ctx, params.id, input.brandAuthorized);
  if (input.landingSlug !== undefined) return changeMemberLink(ctx, params.id, input.landingSlug);
  return setMemberActive(ctx, params.id, input.active ?? true);
});
