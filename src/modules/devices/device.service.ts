import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { buildUserCtx } from '../auth/auth.service';
import { conversationScope, leadScope, opportunityScope, taskScope } from '../leads/scope';
import { pushConfigured, pushToDevice } from '../notifications/push.service';

// DISPOSITIVOS CONECTADOS + "ENVIAR PARA MEU CELULAR".
//
// Segurança:
//  • Link/QR levam só um CÓDIGO curto aleatório (sem dado pessoal, sem token de sessão). O banco guarda
//    apenas o hash; expira em DEEP_LINK_TTL_MINUTES e só abre para o MESMO usuário que o gerou,
//    autenticado no celular. Um terceiro com o link cai no login e, mesmo logado, recebe 403.
//  • A sessão do computador NUNCA é transferida.
//  • Extensão: token próprio por dispositivo (hash no banco), revogável, com acesso só-leitura a
//    rotas marcadas como `device: true`.

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function describeUserAgent(ua: string | null | undefined) {
  const s = ua ?? '';
  const os = /android/i.test(s) ? 'Android' : /iphone|ipad|ios/i.test(s) ? 'iOS' : /windows/i.test(s) ? 'Windows' : /mac os/i.test(s) ? 'macOS' : /linux/i.test(s) ? 'Linux' : 'Desconhecido';
  const browser = /edg\//i.test(s) ? 'Edge' : /opr\//i.test(s) ? 'Opera' : /chrome\//i.test(s) ? 'Chrome' : /firefox\//i.test(s) ? 'Firefox' : /safari\//i.test(s) ? 'Safari' : 'Navegador';
  const mobile = /android|iphone|ipad|mobile/i.test(s);
  return { os, browser, mobile };
}

// ───────────── Web Push: inscrição do navegador ─────────────

export const pushSubscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().max(80).optional(),
  standalone: z.boolean().optional(), // aberto como app instalado (PWA)
});

export async function registerPushDevice(ctx: Ctx, raw: unknown) {
  if (!ctx.userId) throw Forbidden();
  if (!pushConfigured()) throw BadRequest('Push não configurado no servidor (VAPID ausente).');
  const input = pushSubscriptionInput.parse(raw);
  const ua = describeUserAgent(ctx.userAgent);
  const kind = input.standalone ? 'PWA' : ua.mobile ? 'MOBILE' : 'BROWSER';
  const label = input.label || `${ua.browser} · ${ua.os}`;
  const existing = await db.userDevice.findUnique({ where: { pushEndpoint: input.endpoint } });
  const device = existing
    ? await db.userDevice.update({ where: { id: existing.id }, data: { organizationId: ctx.orgId, userId: ctx.userId, pushP256dh: input.keys.p256dh, pushAuth: input.keys.auth, status: 'ACTIVE', revokedAt: null, lastSeenAt: new Date(), kind, label, os: ua.os, browser: ua.browser } })
    : await db.userDevice.create({ data: { organizationId: ctx.orgId, userId: ctx.userId, kind, label, os: ua.os, browser: ua.browser, pushEndpoint: input.endpoint, pushP256dh: input.keys.p256dh, pushAuth: input.keys.auth } });
  await audit(ctx, 'device.connected', { type: 'UserDevice', id: device.id }, { kind, label, channel: 'push' });
  return { id: device.id, kind: device.kind, label: device.label };
}

export async function listDevices(ctx: Ctx) {
  if (!ctx.userId) return [];
  const items = await db.userDevice.findMany({ where: { userId: ctx.userId, organizationId: ctx.orgId }, orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }] });
  return items.map((d) => ({ id: d.id, kind: d.kind, label: d.label, os: d.os, browser: d.browser, status: d.status, push: !!d.pushEndpoint, extension: !!d.tokenHash, lastSeenAt: d.lastSeenAt, createdAt: d.createdAt, revokedAt: d.revokedAt }));
}

export async function revokeDevice(ctx: Ctx, id: string) {
  if (!ctx.userId) throw Forbidden();
  const d = await db.userDevice.findFirst({ where: { id, userId: ctx.userId, organizationId: ctx.orgId } });
  if (!d) throw NotFound('Dispositivo');
  await db.userDevice.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), pushEndpoint: null, pushP256dh: null, pushAuth: null, tokenHash: null } });
  await audit(ctx, 'device.revoked', { type: 'UserDevice', id }, { kind: d.kind, label: d.label });
  return { ok: true };
}

/** Encerra todas as sessões web do usuário (exceto a atual) — "Encerrar sessão em outros dispositivos". */
export async function endOtherSessions(ctx: Ctx, currentTokenHash: string | null) {
  if (!ctx.userId) throw Forbidden();
  const r = await db.session.deleteMany({ where: { userId: ctx.userId, ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}) } });
  await audit(ctx, 'device.revoked', { type: 'Session', id: ctx.userId }, { action: 'end_other_sessions', count: r.count });
  return { ended: r.count };
}

// ───────────── Extensão de navegador ─────────────

export async function createExtensionToken(ctx: Ctx, label?: string) {
  if (!ctx.userId) throw Forbidden();
  const token = `dx_${crypto.randomBytes(32).toString('base64url')}`;
  const ua = describeUserAgent(ctx.userAgent);
  const device = await db.userDevice.create({ data: { organizationId: ctx.orgId, userId: ctx.userId, kind: 'EXTENSION', label: label?.slice(0, 80) || `Extensão · ${ua.browser}`, os: ua.os, browser: ua.browser, tokenHash: sha256(token) } });
  await audit(ctx, 'device.connected', { type: 'UserDevice', id: device.id }, { kind: 'EXTENSION' });
  return { deviceId: device.id, token, apiUrl: env.APP_URL }; // exibido uma única vez
}

/** Autenticação da extensão: "Authorization: Device dx_...". */
export async function ctxFromDeviceToken(raw: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<Ctx | null> {
  if (!raw.startsWith('dx_')) return null;
  const device = await db.userDevice.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!device || device.status !== 'ACTIVE') return null;
  const ctx = await buildUserCtx(device.userId, meta);
  if (!ctx || ctx.orgId !== device.organizationId) return null;
  if (Date.now() - device.lastSeenAt.getTime() > 60_000) await db.userDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return { ...ctx, via: 'device', deviceId: device.id };
}

// ───────────── Enviar para meu celular (deep links) ─────────────

export const TARGETS = { CONVERSATION: 'conversation', LEAD: 'lead', OPPORTUNITY: 'opportunity', TASK: 'task' } as const;
export type TargetType = keyof typeof TARGETS;

export const sendToPhoneInput = z.object({
  targetType: z.enum(['CONVERSATION', 'LEAD', 'OPPORTUNITY', 'TASK']),
  targetId: z.string().min(1).max(64),
  method: z.enum(['QR', 'LINK', 'PUSH']),
  deviceId: z.string().optional(),
});

/** Verifica se o usuário pode ver o recurso (tenant + escopo) antes de gerar qualquer link. */
async function assertTargetAccess(ctx: Ctx, type: TargetType, id: string) {
  const found =
    type === 'CONVERSATION'
      ? await db.conversation.findFirst({ where: { ...conversationScope(ctx), id }, select: { id: true } })
      : type === 'LEAD'
        ? await db.lead.findFirst({ where: { ...leadScope(ctx), id }, select: { id: true } })
        : type === 'OPPORTUNITY'
          ? await db.opportunity.findFirst({ where: { ...opportunityScope(ctx), id }, select: { id: true } })
          : await db.task.findFirst({ where: { ...taskScope(ctx), id }, select: { id: true } });
  if (!found) throw NotFound('Recurso');
}

export function targetPath(type: string, id: string) {
  switch (type) {
    case 'CONVERSATION':
      return `/conversas?c=${encodeURIComponent(id)}`;
    case 'LEAD':
      return `/leads/${encodeURIComponent(id)}`;
    case 'OPPORTUNITY':
      return `/oportunidades/${encodeURIComponent(id)}`;
    default:
      return '/tarefas';
  }
}

export async function sendToPhone(ctx: Ctx, raw: unknown) {
  if (!ctx.userId) throw Forbidden();
  const input = sendToPhoneInput.parse(raw);
  const perm = { CONVERSATION: 'conversation.read', LEAD: 'lead.read', OPPORTUNITY: 'opportunity.read', TASK: 'task.read' } as const;
  assertCan(ctx, perm[input.targetType]);
  await assertTargetAccess(ctx, input.targetType, input.targetId);
  if (input.method === 'PUSH' && !input.deviceId) throw BadRequest('Escolha o dispositivo.');

  const code = crypto.randomBytes(12).toString('base64url'); // 16 caracteres
  const expiresAt = new Date(Date.now() + env.DEEP_LINK_TTL_MINUTES * 60_000);
  const link = await db.deepLink.create({ data: { organizationId: ctx.orgId, userId: ctx.userId, codeHash: sha256(code), targetType: input.targetType, targetId: input.targetId, method: input.method, expiresAt } });
  const url = `${env.APP_URL.replace(/\/$/, '')}/m/${code}`;
  await audit(ctx, 'deep_link.created', { type: 'DeepLink', id: link.id }, { method: input.method, targetType: input.targetType, targetId: input.targetId, expiresAt });

  if (input.method === 'PUSH') {
    const labels: Record<TargetType, string> = { CONVERSATION: 'Conversa', LEAD: 'Lead', OPPORTUNITY: 'Oportunidade', TASK: 'Tarefa' };
    const r = await pushToDevice(ctx.orgId, ctx.userId, input.deviceId!, { title: `📲 ${labels[input.targetType]} enviada do computador`, body: 'Toque para continuar no celular.', url: `/m/${code}`, tag: `send-${link.id}`, priority: 'HIGH' });
    if (!r.ok) throw BadRequest(`Não foi possível enviar o push: ${r.error ?? 'falha no envio'}.`);
    return { method: 'PUSH', expiresAt, delivered: true };
  }
  const qr = input.method === 'QR' ? await QRCode.toDataURL(url, { margin: 1, width: 260, errorCorrectionLevel: 'M' }) : null;
  return { method: input.method, url, qr, expiresAt };
}

export type DeepLinkResolution =
  | { ok: true; path: string }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'FORBIDDEN' | 'LOGIN_REQUIRED' };

/** Abre um link /m/:code. Exige estar logado como o dono do link. */
export async function resolveDeepLink(ctx: Ctx | null, code: string, meta: { userAgent?: string | null } = {}): Promise<DeepLinkResolution> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(code)) return { ok: false, reason: 'NOT_FOUND' };
  const link = await db.deepLink.findUnique({ where: { codeHash: sha256(code) } });
  if (!link) return { ok: false, reason: 'NOT_FOUND' };
  if (link.expiresAt < new Date()) return { ok: false, reason: 'EXPIRED' };
  if (!ctx) return { ok: false, reason: 'LOGIN_REQUIRED' };
  if (ctx.userId !== link.userId || ctx.orgId !== link.organizationId) {
    await audit(ctx, 'deep_link.used', { type: 'DeepLink', id: link.id }, { denied: true, reason: 'other_user' });
    return { ok: false, reason: 'FORBIDDEN' };
  }
  try {
    await assertTargetAccess(ctx, link.targetType as TargetType, link.targetId); // permissão pode ter mudado
  } catch {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  if (!link.usedAt) {
    const ua = describeUserAgent(meta.userAgent);
    await db.deepLink.update({ where: { id: link.id }, data: { usedAt: new Date(), usedByDevice: `${ua.browser} · ${ua.os}` } });
    await audit(ctx, 'deep_link.used', { type: 'DeepLink', id: link.id }, { device: `${ua.browser} · ${ua.os}`, targetType: link.targetType });
  }
  return { ok: true, path: targetPath(link.targetType, link.targetId) };
}
