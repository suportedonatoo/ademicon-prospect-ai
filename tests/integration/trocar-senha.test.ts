import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { changePassword, hashPassword, login } from '@/modules/auth/auth.service';

describe('Trocar a própria senha', () => {
  let A: Awaited<ReturnType<typeof createOrg>>;
  beforeAll(async () => {
    await resetDb();
    A = await createOrg('Org Senha');
    await db.user.update({ where: { id: A.users.consultant.id }, data: { passwordHash: await hashPassword('provisoria-1') } });
  }, 120_000);

  it('exige a senha atual, passa a aceitar só a nova e derruba as outras sessões', async () => {
    const email = A.users.consultant.email;
    const a = await login(email, 'provisoria-1', {});
    const b = await login(email, 'provisoria-1', {});
    await expect(changePassword(a.ctx, { current: 'errada', next: 'nova-senha-9' }, a.token)).rejects.toThrow(/não confere/);

    await changePassword(a.ctx, { current: 'provisoria-1', next: 'nova-senha-9' }, a.token);
    await expect(login(email, 'provisoria-1', {})).rejects.toThrow(/inválidos/);
    expect((await login(email, 'nova-senha-9', {})).ctx.userId).toBe(A.users.consultant.id);
    const { ctxFromSessionToken } = await import('@/modules/auth/auth.service');
    expect(await ctxFromSessionToken(a.token)).not.toBeNull(); // a sessão em uso continua
    expect(await ctxFromSessionToken(b.token)).toBeNull(); // o outro aparelho saiu
  });
});
