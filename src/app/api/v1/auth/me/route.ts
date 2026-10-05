import { authed } from '@/lib/api';

/** GET /api/v1/auth/me — usuário atual, perfil, escopo e permissões. */
export const GET = authed({}, async ({ ctx }) => ({
  userId: ctx.userId,
  name: ctx.userName,
  role: ctx.roleKey,
  scope: ctx.scope,
  pjId: ctx.pjId,
  consultantId: ctx.consultantId,
  permissions: [...ctx.permissions],
}));
