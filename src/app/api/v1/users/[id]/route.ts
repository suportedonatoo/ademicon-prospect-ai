import { authed, body } from '@/lib/api';
import { saveUser } from '@/modules/users/user.service';

export const PATCH = authed<{ id: string }>({ permission: 'user.manage' }, async ({ req, ctx, params }) => {
  const { user } = await saveUser(ctx, await body(req), params.id);
  return { id: user.id, status: user.status };
});
