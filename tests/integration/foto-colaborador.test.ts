import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { photoUrlFor, readConsultantPhoto, removeConsultantPhoto, setConsultantPhoto } from '@/modules/consultants/photo.service';
import { getStorageProvider } from '@/modules/storage/storage.provider';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let su: Ctx;

// PNG de 1×1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Foto');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  su = await A.ctx(await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super Teste', roleId: role.id, passwordHash: 'x' } }));
}, 120_000);

describe('Foto do colaborador', () => {
  it('Super Admin envia a foto; qualquer pessoa da organização vê', async () => {
    const c = A.consultants[1];
    const r = await setConsultantPhoto(su, c.id, PNG);
    expect(r.photoUrl).toMatch(new RegExp(`^/api/v1/team/${c.id}/photo\\?v=`));
    const back = await readConsultantPhoto(await A.ctx(A.users.manager), c.id);
    expect(back.mime).toBe('image/png');
    expect(back.data.equals(PNG)).toBe(true);
  });

  it('trocar a foto apaga a antiga do storage', async () => {
    const c = A.consultants[1];
    const old = (await db.consultant.findUniqueOrThrow({ where: { id: c.id } })).photoKey!;
    await setConsultantPhoto(su, c.id, JPG);
    const now = (await db.consultant.findUniqueOrThrow({ where: { id: c.id } })).photoKey!;
    expect(now).not.toBe(old);
    expect(now.endsWith('.jpg')).toBe(true);
    await expect(getStorageProvider().get(old)).rejects.toThrow();
  });

  it('o próprio consultor troca a dele, mas não a dos outros; Admin do cliente não troca', async () => {
    const me = await A.ctx(A.users.consultant); // ligado ao consultants[0]
    await expect(setConsultantPhoto(me, A.consultants[0].id, PNG)).resolves.toMatchObject({ ok: true });
    await expect(setConsultantPhoto(me, A.consultants[1].id, PNG)).rejects.toThrow(/próprio consultor/);
    await expect(setConsultantPhoto(await A.ctx(A.users.admin), A.consultants[1].id, PNG)).rejects.toThrow(/próprio consultor/);
  });

  it('só aceita imagem de verdade e até 3 MB', async () => {
    const id = A.consultants[2].id;
    await expect(setConsultantPhoto(su, id, Buffer.from('<svg onload=alert(1)>'))).rejects.toThrow(/JPG, PNG ou WEBP/);
    await expect(setConsultantPhoto(su, id, Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]))).rejects.toThrow(/3 MB/);
    await expect(setConsultantPhoto(su, id, Buffer.alloc(0))).rejects.toThrow(/vazio/);
  });

  it('tirar a foto volta para as iniciais', async () => {
    const c = A.consultants[1];
    await removeConsultantPhoto(su, c.id);
    const row = await db.consultant.findUniqueOrThrow({ where: { id: c.id } });
    expect(photoUrlFor(c.id, row.photoKey)).toBeNull();
    await expect(readConsultantPhoto(su, c.id)).rejects.toThrow(/não encontrad/);
  });
});
