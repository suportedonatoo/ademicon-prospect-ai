import { authed, body } from '@/lib/api';
import { listUsers, saveUser } from '@/modules/users/user.service';

export const GET = authed({ permission: 'user.read' }, async ({ ctx }) =>
  (await listUsers(ctx)).map((u) => {
    const safe: Partial<typeof u> = { ...u };
    delete safe.passwordHash; // nunca expor hash de senha
    return safe;
  })
);

/** POST /api/v1/users — cria usuário; retorna senha temporária (exibida uma única vez). */
export const POST = authed({ permission: 'user.manage' }, async ({ req, ctx }) => {
  const { user, tempPassword } = await saveUser(ctx, await body(req));
  return { id: user.id, email: user.email, tempPassword };
});
