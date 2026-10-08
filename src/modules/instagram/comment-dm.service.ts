import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { systemCtx } from '../auth/context';
import { ingestLead } from '../leads/lead-engine';
import { findOrCreateOpenConversation } from '../conversations/conversation.service';
import { getStorageProvider } from '../storage/storage.provider';
import { photoType } from '../consultants/photo.service';
import { landingUrlFor } from '../consultants/landing-link';
import { igBase, OWNER_SELECT, ownerToken } from './instagram.service';

/**
 * COMENTÁRIO → DIRECT (Instagram, conta de cada consultor).
 *
 * Quando alguém comenta num post do consultor uma palavra-chave ("ademicon", "consórcio", "quero"…),
 * a plataforma manda UMA mensagem de apresentação no Direct da pessoa (resposta privada da Meta),
 * cria o lead do consultor e registra a conversa no Inbox.
 *
 * Regras da Meta (Private Replies): 1 mensagem por comentário, em até 7 dias, só texto.
 * Por isso a FOTO vai logo depois que a pessoa responde (aí abre a janela de 24 h e anexo é permitido),
 * e a IA continua a conversa normalmente.
 * Proteção contra repetição: no máximo 1 mensagem por pessoa, por conta, a cada 30 dias.
 */

export const DEFAULT_KEYWORDS = ['ademicon', 'consórcio', 'simular', 'simulação', 'carta de crédito', 'parcela', 'valor', 'quero', 'info'];
export const DEFAULT_MESSAGE =
  'Oi, {nome}! Aqui é {consultor}, consultor de consórcio. Vi seu comentário e separei as informações para você. Me conta: você pensa em imóvel, veículo ou outro objetivo? Responde aqui que eu já te mando os detalhes.';
const REPEAT_DAYS = 30;
const PHOTO_WINDOW_DAYS = 7;
export const AUTO_DM_IMAGE_MAX = 5 * 1024 * 1024;

export interface AutoDmSettings {
  enabled: boolean;
  keywords: string[];
  message: string;
  publicReply: string;
  imageKey: string | null;
}

export function readAutoDm(raw: unknown): AutoDmSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AutoDmSettings>;
  return {
    enabled: !!r.enabled,
    keywords: Array.isArray(r.keywords) && r.keywords.length ? r.keywords.map(String) : DEFAULT_KEYWORDS,
    message: typeof r.message === 'string' && r.message.trim() ? r.message : DEFAULT_MESSAGE,
    publicReply: typeof r.publicReply === 'string' ? r.publicReply : '',
    imageKey: typeof r.imageKey === 'string' ? r.imageKey : null,
  };
}

// ---------- palavra-chave (aceita acento faltando e pequenos erros de digitação) ----------

export const normalize = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Devolve a palavra-chave encontrada no comentário (ou null). */
export function matchKeyword(comment: string, keywords: string[]): string | null {
  const text = ` ${normalize(comment)} `;
  const words = text.trim().split(' ');
  for (const k of keywords) {
    const nk = normalize(k);
    if (!nk) continue;
    if (text.includes(` ${nk} `)) return k;
    // Erro de digitação só em palavra única e longa ("consorsio", "ademicom"): até 1 letra, ou 2 nas de 8+.
    if (!nk.includes(' ') && nk.length >= 5) {
      const max = nk.length >= 8 ? 2 : 1;
      if (words.some((w) => w.length >= nk.length - max && distance(w, nk) <= max)) return k;
    }
  }
  return null;
}

/** Troca {nome}, {consultor} e {link} na mensagem. */
export function fillMessage(template: string, v: { nome: string; consultor: string; link: string }) {
  return template
    .replace(/\{nome\}/gi, v.nome)
    .replace(/\{consultor\}/gi, v.consultor)
    .replace(/\{link\}/gi, v.link)
    .replace(/\s+\n/g, '\n')
    .trim()
    .slice(0, 1000);
}

// ---------- webhook de comentários ----------

interface CommentValue {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string; self_ig_scoped_id?: string };
  media?: { id?: string; media_product_type?: string };
}
interface IgCommentsWebhook {
  object?: string;
  entry?: { id?: string; time?: number; changes?: { field?: string; value?: CommentValue }[] }[];
}

export function parseCommentsWebhook(body: IgCommentsWebhook) {
  if (body?.object !== 'instagram') return [];
  const out: { accountId: string; commentId: string; commenterId: string; username: string | null; text: string; mediaId: string | null }[] = [];
  for (const e of body.entry ?? [])
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (c.field !== 'comments' || !e.id || !v?.id || !v.from?.id || !v.text) continue;
      if (v.from.id === e.id) continue; // comentário da própria conta (inclusive a nossa resposta pública)
      out.push({ accountId: e.id, commentId: v.id, commenterId: v.from.id, username: v.from.username ?? null, text: v.text.slice(0, 2000), mediaId: v.media?.id ?? null });
    }
  return out;
}

type IgOut = { status: 'SENT' | 'FAILED'; id?: string; error?: string };
async function igPost(url: string, token: string, body: unknown): Promise<IgOut> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const b = (await res.json().catch(() => ({}))) as { id?: string; message_id?: string; error?: { message?: string; code?: number } };
    if (res.ok && !b.error) return { status: 'SENT', id: b.message_id ?? b.id };
    return { status: 'FAILED', error: `Meta (${b.error?.code ?? res.status}): ${b.error?.message ?? 'erro'}` };
  } catch (e) {
    return { status: 'FAILED', error: String(e) };
  }
}

const landingLink = (slug: string | null) => (slug ? landingUrlFor(slug) : '');

export async function receiveInstagramComments(orgSlug: string | null, body: IgCommentsWebhook) {
  const events = parseCommentsWebhook(body);
  if (!events.length) return { comments: 0, results: [] as { commentId: string; status: string }[] };
  const org = orgSlug ? await db.organization.findUnique({ where: { slug: orgSlug } }) : await db.organization.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!org) throw Forbidden('Organização desconhecida.');
  const results: { commentId: string; status: string }[] = [];
  for (const ev of events) {
    try {
      results.push({ commentId: ev.commentId, status: await handleComment(org.id, ev) });
    } catch (e) {
      logger.error('instagram.comment_failed', { commentId: ev.commentId, error: String(e) });
      results.push({ commentId: ev.commentId, status: 'ERROR' });
    }
  }
  return { comments: events.length, results };
}

async function handleComment(orgId: string, ev: ReturnType<typeof parseCommentsWebhook>[number]): Promise<string> {
  const owner = await db.consultant.findFirst({
    where: { organizationId: orgId, active: true, instagramAccountId: ev.accountId },
    select: { ...OWNER_SELECT, name: true, landingSlug: true, instagramAutoDm: true },
  });
  if (!owner) return 'IGNORED_ACCOUNT';
  // Vídeo configurado (link + palavra-chave) tem prioridade; nos outros posts vale a resposta automática geral.
  const { ruleForComment } = await import('./post-rules.service');
  const rule = await ruleForComment(owner, ev.mediaId);
  const general = readAutoDm(owner.instagramAutoDm);
  if (!rule && !general.enabled) return 'DISABLED';
  const cfg = rule ? { keywords: rule.keywords as string[], message: rule.message, publicReply: rule.publicReply } : general;
  const keyword = matchKeyword(ev.text, cfg.keywords);
  if (!keyword) return 'NO_KEYWORD';
  // A Meta pode reenviar o mesmo webhook: um comentário só é tratado uma vez.
  if (await db.instagramCommentDm.findUnique({ where: { commentId: ev.commentId }, select: { id: true } })) return 'DUPLICATE';

  const base = { organizationId: orgId, consultantId: owner.id, accountId: ev.accountId, commentId: ev.commentId, commenterId: ev.commenterId, commenterUsername: ev.username, mediaId: ev.mediaId, commentText: ev.text, keyword, ruleId: rule?.id ?? null };
  // Repetição: no vídeo configurado, 1 mensagem por pessoa naquele vídeo; na resposta geral, 1 a cada 30 dias.
  const recent = await db.instagramCommentDm.findFirst({
    where: rule
      ? { ruleId: rule.id, commenterId: ev.commenterId, status: { in: ['SENT', 'SIMULATED'] } }
      : { accountId: ev.accountId, commenterId: ev.commenterId, ruleId: null, status: { in: ['SENT', 'SIMULATED'] }, createdAt: { gte: new Date(Date.now() - REPEAT_DAYS * 86400_000) } },
    select: { id: true },
  });
  if (recent) {
    await db.instagramCommentDm.create({ data: { ...base, status: 'SKIPPED_REPEAT' } });
    return 'SKIPPED_REPEAT';
  }

  const token = await ownerToken(owner);
  const nome = ev.username ? `@${ev.username}` : 'tudo bem';
  const text = fillMessage(cfg.message, { nome, consultor: owner.name.split(' ')[0], link: landingLink(owner.landingSlug) });
  const sent: IgOut = token ? await igPost(`${igBase()}/${ev.accountId}/messages`, token, { recipient: { comment_id: ev.commentId }, message: { text } }) : { status: 'FAILED', error: 'Conta do Instagram sem token. Reconecte em Meu perfil.' };

  // Resposta pública opcional no próprio comentário ("Te chamei no Direct!") — não impede o resto se falhar.
  if (sent.status === 'SENT' && token && cfg.publicReply.trim()) {
    const pub = await igPost(`${igBase()}/${ev.commentId}/replies`, token, { message: fillMessage(cfg.publicReply, { nome, consultor: owner.name.split(' ')[0], link: '' }) });
    if (pub.status === 'FAILED') logger.warn('instagram.public_reply_failed', { commentId: ev.commentId, error: pub.error });
  }

  // Lead do consultor (a mesma identidade que as DMs usam: IGSID + conta).
  const externalId = `${ev.commenterId}:${ev.accountId}`;
  const identityValue = `INSTAGRAM:${externalId}`;
  let identity = await db.leadIdentity.findUnique({ where: { organizationId_type_value: { organizationId: orgId, type: 'EXTERNAL', value: identityValue } } });
  if (!identity) {
    await ingestLead(systemCtx(orgId, 'Instagram'), {
      name: ev.username ? `@${ev.username}` : 'Contato Instagram',
      source: 'INSTAGRAM',
      externalId,
      medium: 'instagram-comentario',
      routingHint: `OWNER:${owner.id}`,
      dataOrigin: `Comentário público no Instagram com a palavra "${keyword}"`,
    });
    identity = await db.leadIdentity.findUniqueOrThrow({ where: { organizationId_type_value: { organizationId: orgId, type: 'EXTERNAL', value: identityValue } } });
  }
  const lead = await db.lead.findUniqueOrThrow({ where: { id: identity.leadId }, select: { id: true, consultantId: true } });
  const { conversation } = await findOrCreateOpenConversation(orgId, lead.id, 'INSTAGRAM', { currentAgent: 'PROSPECT', assignedConsultantId: lead.consultantId });
  await db.message.createMany({
    data: [
      { organizationId: orgId, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'SYSTEM', content: `Comentou no Instagram: "${ev.text.slice(0, 300)}"`, status: 'SENT' },
      {
        organizationId: orgId,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        senderType: 'AI',
        agentKey: 'INSTAGRAM_COMENTARIO',
        content: sent.status === 'SENT' ? text : `Mensagem automática não enviada: ${sent.error}`,
        status: sent.status,
        externalId: sent.id ?? null,
      },
    ],
  });
  await db.instagramCommentDm.create({ data: { ...base, status: sent.status, error: sent.error ?? null, leadId: lead.id } });
  logger.info('instagram.comment_dm', { consultantId: owner.id, commentId: ev.commentId, status: sent.status });
  return sent.status;
}

// ---------- foto depois da resposta da pessoa ----------

const imageSig = (consultantId: string, key: string) => crypto.createHmac('sha256', `ig-image:${env.SESSION_SECRET}`).update(`${consultantId}:${key}`).digest('base64url');

/** Endereço público (assinado) da foto — a Meta baixa a imagem por ele. */
export const autoDmImageUrl = (consultantId: string, key: string) => `${env.APP_URL}/api/v1/public/instagram-image/${consultantId}?k=${encodeURIComponent(key)}&s=${imageSig(consultantId, key)}`;

export async function readAutoDmImagePublic(consultantId: string, key: string, sig: string) {
  const expected = Buffer.from(imageSig(consultantId, key));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) throw Forbidden('Link inválido.');
  const c = await db.consultant.findUnique({ where: { id: consultantId }, select: { instagramAutoDm: true, photoKey: true } });
  const cfg = readAutoDm(c?.instagramAutoDm);
  const ofRule = c && key !== cfg.imageKey && key !== c.photoKey ? await db.instagramPostRule.findFirst({ where: { consultantId, imageKeys: { array_contains: [key] } }, select: { id: true } }) : null;
  if (!c || (key !== cfg.imageKey && key !== c.photoKey && !ofRule)) throw NotFound('Imagem');
  const data = await getStorageProvider().get(key);
  return { data, mime: photoType(data)?.mime ?? 'image/jpeg' };
}

/**
 * Chamado quando chega uma DM numa conta de consultor: se essa pessoa recebeu a mensagem do comentário
 * e ainda não recebeu a foto, manda a foto agora (a resposta dela abriu a janela de 24 h).
 */
export async function sendPendingPhoto(orgId: string, accountId: string, igsid: string, conversationId: string) {
  const pending = await db.instagramCommentDm.findFirst({
    where: { organizationId: orgId, accountId, commenterId: igsid, status: { in: ['SENT', 'SIMULATED'] }, photoSentAt: null, createdAt: { gte: new Date(Date.now() - PHOTO_WINDOW_DAYS * 86400_000) } },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending?.consultantId) return null;
  const owner = await db.consultant.findUnique({ where: { id: pending.consultantId }, select: { ...OWNER_SELECT, photoKey: true, instagramAutoDm: true } });
  if (!owner) return null;
  // Veio de um vídeo configurado: as fotos daquele vídeo (até 3; nenhuma = "só mensagem").
  // Resposta automática geral: a foto de apresentação (ou a foto do perfil).
  const rule = pending.ruleId ? await db.instagramPostRule.findUnique({ where: { id: pending.ruleId }, select: { imageKeys: true } }) : null;
  const keys = rule ? (rule.imageKeys as string[]) : [readAutoDm(owner.instagramAutoDm).imageKey ?? owner.photoKey].filter((k): k is string => !!k);
  // Marca antes de enviar: duas mensagens seguidas da pessoa não mandam as fotos duas vezes.
  const claimed = await db.instagramCommentDm.updateMany({ where: { id: pending.id, photoSentAt: null }, data: { photoSentAt: new Date() } });
  if (!claimed.count || !keys.length) return null;
  const token = await ownerToken(owner);
  if (!token) return null;
  let last = 'SENT';
  for (const [n, key] of keys.entries()) {
    const r = await igPost(`${igBase()}/${accountId}/messages`, token, { recipient: { id: igsid }, message: { attachment: { type: 'image', payload: { url: autoDmImageUrl(owner.id, key) } } } });
    const label = keys.length > 1 ? `foto ${n + 1} de ${keys.length}` : 'foto de apresentação';
    await db.message.create({ data: { organizationId: orgId, conversationId, direction: 'OUTBOUND', senderType: 'AI', agentKey: 'INSTAGRAM_COMENTARIO', content: r.status === 'SENT' ? `[${label} enviada]` : `${label[0].toUpperCase()}${label.slice(1)} não enviada: ${r.error}`, status: r.status, externalId: r.id ?? null } });
    last = r.status;
  }
  return last;
}

// ---------- configuração (tela Meu perfil) ----------

async function editable(ctx: Ctx, consultantId: string) {
  if (consultantId !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN' && !ctx.permissions.has('consultant.manage')) throw Forbidden('Só o próprio consultor, a gestão ou o Super Admin mudam a resposta automática.');
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { id: true, instagramAutoDm: true, instagramAccountId: true } });
  if (!c) throw NotFound('Consultor');
  return c;
}

export async function getAutoDm(ctx: Ctx, consultantId: string) {
  const c = await editable(ctx, consultantId);
  const cfg = readAutoDm(c.instagramAutoDm);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [sent30, recent] = await Promise.all([
    db.instagramCommentDm.count({ where: { consultantId, status: 'SENT', createdAt: { gte: since } } }),
    db.instagramCommentDm.findMany({ where: { consultantId }, orderBy: { createdAt: 'desc' }, take: 10, select: { createdAt: true, commenterUsername: true, commentText: true, keyword: true, status: true, error: true, photoSentAt: true } }),
  ]);
  return { ...cfg, hasImage: !!cfg.imageKey, connected: !!c.instagramAccountId, sent30, recent };
}

export async function saveAutoDm(ctx: Ctx, consultantId: string, input: { enabled: boolean; keywords: string[]; message: string; publicReply: string }) {
  const c = await editable(ctx, consultantId);
  const keywords = [...new Set(input.keywords.map((k) => k.trim()).filter((k) => normalize(k).length >= 2))].slice(0, 30);
  if (input.enabled && !keywords.length) throw BadRequest('Informe ao menos uma palavra-chave.');
  if (input.enabled && !input.message.trim()) throw BadRequest('Escreva a mensagem de apresentação.');
  const cur = readAutoDm(c.instagramAutoDm);
  const next: AutoDmSettings = { enabled: input.enabled, keywords, message: input.message.trim().slice(0, 1000), publicReply: input.publicReply.trim().slice(0, 300), imageKey: cur.imageKey };
  await db.consultant.update({ where: { id: c.id }, data: { instagramAutoDm: next as never } });
  return { ok: true };
}

export async function setAutoDmImage(ctx: Ctx, consultantId: string, data: Buffer) {
  const c = await editable(ctx, consultantId);
  if (!data.length) throw BadRequest('Arquivo vazio.');
  if (data.length > AUTO_DM_IMAGE_MAX) throw BadRequest('Imagem muito grande: máximo de 5 MB.');
  const type = photoType(data);
  if (!type || type.ext === 'webp') throw BadRequest('Envie a imagem em JPG ou PNG (formatos aceitos pelo Instagram).');
  const storage = getStorageProvider();
  const key = `instagram/${ctx.orgId}/${c.id}-${Date.now().toString(36)}.${type.ext}`;
  await storage.put(key, data, type.mime);
  const cur = readAutoDm(c.instagramAutoDm);
  await db.consultant.update({ where: { id: c.id }, data: { instagramAutoDm: { ...cur, imageKey: key } as never } });
  if (cur.imageKey) await storage.delete(cur.imageKey).catch(() => undefined);
  return { ok: true };
}

export async function removeAutoDmImage(ctx: Ctx, consultantId: string) {
  const c = await editable(ctx, consultantId);
  const cur = readAutoDm(c.instagramAutoDm);
  if (!cur.imageKey) return { ok: true };
  await db.consultant.update({ where: { id: c.id }, data: { instagramAutoDm: { ...cur, imageKey: null } as never } });
  await getStorageProvider()
    .delete(cur.imageKey)
    .catch(() => undefined);
  return { ok: true };
}

/** A imagem para a pré-visualização na tela (usuário logado). */
export async function readAutoDmImage(ctx: Ctx, consultantId: string) {
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { instagramAutoDm: true } });
  const key = readAutoDm(c?.instagramAutoDm).imageKey;
  if (!key) throw NotFound('Imagem');
  const data = await getStorageProvider().get(key);
  return { data, mime: photoType(data)?.mime ?? 'image/jpeg' };
}
