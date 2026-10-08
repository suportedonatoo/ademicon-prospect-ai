import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { BadRequest, Conflict, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { getStorageProvider } from '../storage/storage.provider';
import { photoType } from '../consultants/photo.service';
import { getAIProvider } from '../ai/providers';
import { igBase, OWNER_SELECT, ownerToken } from './instagram.service';
import { normalize } from './comment-dm.service';

/**
 * VÍDEO COM PALAVRA-CHAVE (Instagram do consultor)
 *
 * O consultor cola o link do vídeo/post, define as palavras-chave ("ademicon"), a resposta pública
 * ("Olha sua DM, te encaminhei uma mensagem") e a mensagem do Direct. A IA sugere 2 versões da mensagem;
 * ele escolhe uma das 3 e é essa que vai. Opcional: até 3 fotos.
 *
 * Quem comentar a palavra NAQUELE post: resposta privada no Direct (1 mensagem de texto — regra da Meta)
 * + resposta pública no comentário. As fotos vão quando a pessoa responde no Direct (aí anexo é permitido).
 */

export const MAX_RULE_IMAGES = 3;
export const RULE_IMAGE_MAX = 5 * 1024 * 1024;
export const DEFAULT_PUBLIC_REPLY = 'Olha sua DM, {nome}! Te encaminhei uma mensagem 😉';

/** Código do post no link: instagram.com/reel/ABC123/, /p/ABC123/, /tv/…, com ou sem usuário no caminho. */
export function shortcodeFromUrl(url: string): string | null {
  const m = url.trim().match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/i);
  return m ? m[1] : null;
}

export const ruleInput = z.object({
  postUrl: z.string().trim().min(10).max(300),
  keywords: z.array(z.string().trim().max(40)).max(20),
  message: z.string().trim().min(10, 'Escreva a mensagem do Direct.').max(1000),
  publicReply: z.string().trim().max(300).default(DEFAULT_PUBLIC_REPLY),
  active: z.boolean().default(true),
});

async function ownerOf(ctx: Ctx, consultantId: string) {
  if (consultantId !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN' && !ctx.permissions.has('consultant.manage')) throw Forbidden('Só o próprio consultor, a gestão ou o Super Admin mexem nos vídeos deste consultor.');
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { ...OWNER_SELECT, name: true, instagramUsername: true } });
  if (!c) throw NotFound('Consultor');
  return c;
}

type Media = { id: string; shortcode?: string; caption?: string; thumbnail_url?: string; media_url?: string; media_type?: string };

/** Procura o post nas publicações da conta conectada (até ~300 mais recentes). */
async function findMedia(token: string, shortcode: string): Promise<Media | null> {
  let url: string | null = `${igBase()}/me/media?fields=id,shortcode,caption,media_type,thumbnail_url,media_url&limit=50`;
  for (let page = 0; url && page < 6; page++) {
    const res: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const b = (await res.json().catch(() => ({}))) as { data?: Media[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok || b.error) throw BadRequest(`Instagram recusou: ${b.error?.message ?? `HTTP ${res.status}`}`);
    const hit = (b.data ?? []).find((m) => m.shortcode === shortcode);
    if (hit) return hit;
    url = b.paging?.next ?? null;
  }
  return null;
}

const cleanKeywords = (list: string[]) => [...new Set(list.map((k) => k.trim()).filter((k) => normalize(k).length >= 2))].slice(0, 20);

export async function listPostRules(ctx: Ctx, consultantId: string) {
  await ownerOf(ctx, consultantId);
  const rules = await db.instagramPostRule.findMany({ where: { consultantId }, orderBy: { createdAt: 'desc' } });
  const counts = await db.instagramCommentDm.groupBy({ by: ['ruleId', 'status'], where: { ruleId: { in: rules.map((r) => r.id) } }, _count: { _all: true } });
  return rules.map((r) => ({
    ...r,
    keywords: r.keywords as string[],
    images: (r.imageKeys as string[]).length,
    sent: counts.filter((c) => c.ruleId === r.id && c.status === 'SENT').reduce((a, c) => a + c._count._all, 0),
    failed: counts.filter((c) => c.ruleId === r.id && c.status === 'FAILED').reduce((a, c) => a + c._count._all, 0),
  }));
}

export async function savePostRule(ctx: Ctx, consultantId: string, raw: unknown, id?: string) {
  const c = await ownerOf(ctx, consultantId);
  const i = ruleInput.parse(raw);
  const shortcode = shortcodeFromUrl(i.postUrl);
  if (!shortcode) throw BadRequest('Link inválido. Copie o link do vídeo no Instagram (Compartilhar → Copiar link). Ex.: https://www.instagram.com/reel/ABC123/');
  const keywords = cleanKeywords(i.keywords);
  if (!keywords.length) throw BadRequest('Informe ao menos uma palavra-chave.');
  if (!c.instagramAccountId) throw BadRequest('Conecte o Instagram em Meu perfil antes de configurar vídeos.');
  const dupe = await db.instagramPostRule.findFirst({ where: { consultantId, shortcode, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dupe) throw Conflict('Este vídeo já está configurado. Edite a configuração que já existe.');

  // Confere que o vídeo é desta conta (e guarda o id que chega nos comentários).
  const token = await ownerToken(c);
  let media: Media | null = null;
  if (token) {
    media = await findMedia(token, shortcode);
    if (!media) throw BadRequest(`Não achei este vídeo nas publicações de @${c.instagramUsername ?? 'sua conta'}. Confira se o link é de um vídeo seu, desta conta conectada.`);
  }
  const data = {
    postUrl: i.postUrl,
    shortcode,
    mediaId: media?.id ?? null,
    caption: media?.caption?.slice(0, 500) ?? null,
    thumbnailUrl: media?.thumbnail_url ?? (media?.media_type === 'IMAGE' ? (media.media_url ?? null) : null),
    keywords,
    message: i.message,
    publicReply: i.publicReply || DEFAULT_PUBLIC_REPLY,
    active: i.active,
  };
  if (id) {
    const cur = await db.instagramPostRule.findFirst({ where: { id, consultantId }, select: { id: true } });
    if (!cur) throw NotFound('Vídeo');
    return db.instagramPostRule.update({ where: { id }, data });
  }
  return db.instagramPostRule.create({ data: { organizationId: ctx.orgId, consultantId, ...data } });
}

async function ruleOf(ctx: Ctx, id: string) {
  const r = await db.instagramPostRule.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!r) throw NotFound('Vídeo');
  await ownerOf(ctx, r.consultantId);
  return r;
}

export async function setPostRuleActive(ctx: Ctx, id: string, active: boolean) {
  await ruleOf(ctx, id);
  return db.instagramPostRule.update({ where: { id }, data: { active } });
}

export async function deletePostRule(ctx: Ctx, id: string) {
  const r = await ruleOf(ctx, id);
  for (const k of r.imageKeys as string[]) await getStorageProvider().delete(k).catch(() => undefined);
  await db.instagramPostRule.delete({ where: { id } });
  return { ok: true };
}

export async function addPostRuleImage(ctx: Ctx, id: string, data: Buffer) {
  const r = await ruleOf(ctx, id);
  const keys = r.imageKeys as string[];
  if (keys.length >= MAX_RULE_IMAGES) throw BadRequest(`Máximo de ${MAX_RULE_IMAGES} fotos por vídeo.`);
  if (!data.length) throw BadRequest('Arquivo vazio.');
  if (data.length > RULE_IMAGE_MAX) throw BadRequest('Foto muito grande: máximo de 5 MB.');
  const type = photoType(data);
  if (!type || type.ext === 'webp') throw BadRequest('Envie a foto em JPG ou PNG (formatos aceitos pelo Instagram).');
  const key = `instagram/${ctx.orgId}/${r.consultantId}-v-${Date.now().toString(36)}.${type.ext}`;
  await getStorageProvider().put(key, data, type.mime);
  await db.instagramPostRule.update({ where: { id }, data: { imageKeys: [...keys, key] } });
  return { ok: true, images: keys.length + 1 };
}

export async function removePostRuleImage(ctx: Ctx, id: string, index: number) {
  const r = await ruleOf(ctx, id);
  const keys = r.imageKeys as string[];
  const key = keys[index];
  if (!key) throw NotFound('Foto');
  await db.instagramPostRule.update({ where: { id }, data: { imageKeys: keys.filter((_, n) => n !== index) } });
  await getStorageProvider()
    .delete(key)
    .catch(() => undefined);
  return { ok: true };
}

export async function readPostRuleImage(ctx: Ctx, id: string, index: number) {
  const r = await ruleOf(ctx, id);
  const key = (r.imageKeys as string[])[index];
  if (!key) throw NotFound('Foto');
  const data = await getStorageProvider().get(key);
  return { data, mime: photoType(data)?.mime ?? 'image/jpeg' };
}

/** 2 ideias da IA a partir da mensagem do consultor (para ele escolher entre a dele e as duas). */
export async function postRuleIdeas(ctx: Ctx, consultantId: string, raw: unknown) {
  const c = await ownerOf(ctx, consultantId);
  const i = z.object({ message: z.string().trim().min(10, 'Escreva a sua mensagem primeiro: a IA cria as ideias a partir dela.').max(1000), keywords: z.array(z.string()).max(20).default([]), caption: z.string().max(500).nullable().optional(), exclude: z.array(z.string().max(1000)).max(20).default([]) }).parse(raw);
  const context = [`Consultor: ${c.name.split(' ')[0]}`, i.keywords.length ? `Palavras-chave do vídeo: ${i.keywords.join(', ')}` : '', i.caption ? `Legenda do vídeo: ${i.caption}` : ''].filter(Boolean).join('. ');
  const ideas = await getAIProvider().ideas({ message: i.message, context, count: 2, exclude: i.exclude });
  return { ideas };
}

/** Regra do post que recebeu o comentário. Regras salvas sem o id do post ganham o id na primeira vez. */
export async function ruleForComment(owner: { id: string; instagramAccountId: string | null; instagramTokenEnc: string | null; instagramTokenExpiresAt: Date | null }, mediaId: string | null) {
  if (!mediaId) return null;
  const direct = await db.instagramPostRule.findFirst({ where: { consultantId: owner.id, mediaId, active: true } });
  if (direct) return direct;
  const pending = await db.instagramPostRule.findMany({ where: { consultantId: owner.id, mediaId: null, active: true }, select: { id: true, shortcode: true } });
  if (!pending.length) return null;
  try {
    const token = await ownerToken(owner);
    if (!token) return null;
    const res = await fetch(`${igBase()}/${mediaId}?fields=shortcode`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const b = (await res.json().catch(() => ({}))) as { shortcode?: string };
    const hit = pending.find((p) => p.shortcode === b.shortcode);
    if (!hit) return null;
    return db.instagramPostRule.update({ where: { id: hit.id }, data: { mediaId } });
  } catch (e) {
    logger.warn('instagram.rule_media_lookup_failed', { mediaId, error: String(e) });
    return null;
  }
}
