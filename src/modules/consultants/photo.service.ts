import { db } from '@/lib/db';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { getStorageProvider } from '../storage/storage.provider';

/**
 * FOTO DO COLABORADOR — aparece só dentro do sistema (lista da equipe, perfil, painel).
 * A página pública (mestre ou link próprio) continua sem nada do consultor.
 * Quem pode trocar: a equipe da plataforma (Super Admin) ou o próprio consultor.
 */
const isSuperAdmin = (ctx: Ctx) => ctx.roleKey === 'SUPER_ADMIN';

export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

const TYPES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** Tipo real pelo conteúdo (não pela extensão do nome). */
export function photoType(data: Buffer) {
  return TYPES.find((t) => t.test(data)) ?? null;
}

async function findConsultant(ctx: Ctx, consultantId: string) {
  const c = await db.consultant.findFirst({
    where: { id: consultantId, organizationId: ctx.orgId },
    select: { id: true, photoKey: true },
  });
  if (!c) throw NotFound('Consultor');
  return c;
}

export async function setConsultantPhoto(ctx: Ctx, consultantId: string, data: Buffer) {
  if (!isSuperAdmin(ctx) && ctx.consultantId !== consultantId) throw Forbidden('Só a equipe da plataforma ou o próprio consultor troca a foto.');
  if (!data.length) throw BadRequest('Arquivo vazio.');
  if (data.length > PHOTO_MAX_BYTES) throw BadRequest('Foto muito grande: máximo de 3 MB.');
  const type = photoType(data);
  if (!type) throw BadRequest('Envie uma foto JPG, PNG ou WEBP.');
  const c = await findConsultant(ctx, consultantId);
  const storage = getStorageProvider();
  const key = `fotos/${ctx.orgId}/${c.id}-${Date.now().toString(36)}.${type.ext}`;
  await storage.put(key, data, type.mime);
  await db.consultant.update({ where: { id: c.id }, data: { photoKey: key } });
  if (c.photoKey) await storage.delete(c.photoKey).catch(() => undefined);
  await audit(ctx, 'user.changed', { type: 'Consultant', id: c.id }, { action: 'photo_changed' });
  return { ok: true, photoUrl: photoUrlFor(c.id, key) };
}

export async function removeConsultantPhoto(ctx: Ctx, consultantId: string) {
  if (!isSuperAdmin(ctx) && ctx.consultantId !== consultantId) throw Forbidden('Só a equipe da plataforma ou o próprio consultor tira a foto.');
  const c = await findConsultant(ctx, consultantId);
  if (!c.photoKey) return { ok: true };
  await db.consultant.update({ where: { id: c.id }, data: { photoKey: null } });
  await getStorageProvider()
    .delete(c.photoKey)
    .catch(() => undefined);
  await audit(ctx, 'user.changed', { type: 'Consultant', id: c.id }, { action: 'photo_removed' });
  return { ok: true };
}

/** Lê a foto (qualquer pessoa logada da mesma organização). */
export async function readConsultantPhoto(ctx: Ctx, consultantId: string) {
  const c = await findConsultant(ctx, consultantId);
  if (!c.photoKey) throw NotFound('Foto');
  const data = await getStorageProvider().get(c.photoKey);
  return { data, mime: photoType(data)?.mime ?? 'application/octet-stream' };
}

/** URL interna da foto; a chave entra como versão para o navegador não mostrar a antiga. */
export const photoUrlFor = (consultantId: string, photoKey: string | null | undefined) =>
  photoKey ? `/api/v1/team/${consultantId}/photo?v=${encodeURIComponent(photoKey.split('/').pop() ?? '')}` : null;
