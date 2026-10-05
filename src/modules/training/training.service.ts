import { z } from 'zod';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { assertSuperAdmin } from '../platform/credentials.service';

/**
 * TREINAMENTO DA EQUIPE: vídeos (YouTube/Vimeo), apostilas e links cadastrados pelo Super Admin.
 * Todo usuário vê a trilha e marca o que concluiu; o Super Admin acompanha o progresso de cada um.
 */

export const trainingInput = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1000).nullable().optional(),
  url: z.string().trim().url('Informe um link válido (https://…)').refine((u) => /^https:\/\//i.test(u), 'Use um link https://'),
  category: z.string().trim().min(2).max(60).default('Geral'),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

/** Link de incorporação para YouTube/Vimeo; outros links abrem em nova aba. */
export function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export async function listTraining(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  const items = await db.trainingItem.findMany({
    where: { organizationId: ctx.orgId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
  const done = ctx.userId ? await db.trainingProgress.findMany({ where: { organizationId: ctx.orgId, userId: ctx.userId }, select: { itemId: true, completedAt: true } }) : [];
  return items.map((i) => ({ ...i, embed: embedUrl(i.url), completedAt: done.find((d) => d.itemId === i.id)?.completedAt ?? null }));
}

export async function saveTraining(ctx: Ctx, raw: unknown, id?: string) {
  assertSuperAdmin(ctx);
  const input = trainingInput.parse(raw);
  const item = id
    ? await db.trainingItem.update({ where: { id, organizationId: ctx.orgId }, data: input })
    : await db.trainingItem.create({ data: { organizationId: ctx.orgId, ...input } });
  await audit(ctx, 'settings.changed', { type: 'TrainingItem', id: item.id }, { action: id ? 'updated' : 'created' });
  return item;
}

export async function deleteTraining(ctx: Ctx, id: string) {
  assertSuperAdmin(ctx);
  const n = await db.trainingItem.deleteMany({ where: { id, organizationId: ctx.orgId } });
  if (!n.count) throw NotFound('Conteúdo');
  await audit(ctx, 'settings.changed', { type: 'TrainingItem', id }, { action: 'deleted' });
  return { ok: true };
}

export async function setCompleted(ctx: Ctx, itemId: string, completed: boolean) {
  if (!ctx.userId) throw NotFound('Usuário');
  const item = await db.trainingItem.findFirst({ where: { id: itemId, organizationId: ctx.orgId }, select: { id: true } });
  if (!item) throw NotFound('Conteúdo');
  if (completed) {
    await db.trainingProgress.upsert({ where: { itemId_userId: { itemId, userId: ctx.userId } }, create: { organizationId: ctx.orgId, itemId, userId: ctx.userId }, update: {} });
  } else {
    await db.trainingProgress.deleteMany({ where: { itemId, userId: ctx.userId } });
  }
  return { ok: true };
}

/** Progresso da equipe (Super Admin): quantos conteúdos ativos cada pessoa concluiu. */
export async function teamProgress(ctx: Ctx) {
  assertSuperAdmin(ctx);
  const [total, users, done] = await Promise.all([
    db.trainingItem.count({ where: { organizationId: ctx.orgId, active: true } }),
    db.user.findMany({ where: { organizationId: ctx.orgId, status: 'ACTIVE', consultantId: { not: null } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.trainingProgress.groupBy({ by: ['userId'], where: { organizationId: ctx.orgId, item: { active: true } }, _count: { _all: true } }),
  ]);
  return { total, users: users.map((u) => ({ ...u, completed: done.find((d) => d.userId === u.id)?._count._all ?? 0 })) };
}
